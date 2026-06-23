import multer, { type FileFilterCallback } from "multer";
import express, { type Request, type Response } from "express";
import { AuthenticatedRequest, authMiddleware } from "../middlewares/auth.middleware";
import { logger } from "../../config";
import { ProxyProtocol } from "../../database/proxy.model";
import { ProxyService } from "../services/proxy.service";

type MulterFile = Express.Multer.File;

const storage = multer.diskStorage({
  destination: "storage/pictures",
  filename: (_req: Request, file: MulterFile, cb: (err: Error | null, filename: string) => void) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});


const proxiesStorage = multer.diskStorage({
  destination: "storage/proxies",
  filename: (_req: Request, file: MulterFile, cb: (err: Error | null, filename: string) => void) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const photos = multer({ storage });


const proxies = multer({
  storage: proxiesStorage,
  fileFilter: (_req: Request, file: MulterFile, cb: FileFilterCallback) => {
    if (file.mimetype === "text/plain" || file.originalname.endsWith(".txt")) {
      cb(null, true);
    } else {
      cb(new Error("Only .txt files are allowed"));
    }
  }
});

const bulkProxies = multer({
  storage: proxiesStorage,
  limits: { files: 100 },
  fileFilter: (_req: Request, file: MulterFile, cb: FileFilterCallback) => {
    if (file.mimetype === "text/plain" || file.originalname.endsWith(".txt")) {
      cb(null, true);
    } else {
      cb(new Error("Only .txt files are allowed"));
    }
  }
});

const router = express.Router();

const uploadProgress = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  const contentLength = parseInt(req.headers["content-length"] || "0");
  let uploadedBytes = 0;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Cache-Control"
  });

  res.write(`data: ${JSON.stringify({ progress: 0, status: "starting" })}\n\n`);

  req.on("data", (chunk: Buffer) => {
    uploadedBytes += chunk.length;
    const progress = Math.round((uploadedBytes / contentLength) * 100);
    res.write(`data: ${JSON.stringify({
      progress,
      status: "uploading",
      uploadedBytes,
      totalBytes: contentLength
    })}\n\n`);
  });

  next();
};


export const uploadProxies = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  proxies.array("proxies", 100)(req, res, (err: unknown) => {
    if (err) {
      const e = err as Error;
      logger.error("Multer error:", err);
      res.write(`data: ${JSON.stringify({
        progress: 100,
        status: "error",
        message: e.message || "Upload failed"
      })}\n\n`);
      res.end();
    } else {
      next();
    }
  });
};

router.post("/upload-photo", photos.single("photo"),
  /*
    #swagger.tags = ['Upload']
    #swagger.summary = 'Загрузка фотографии'
    #swagger.description = 'Загрузка одной фотографии'
    #swagger.consumes = ['multipart/form-data']
    #swagger.parameters['photo'] = {
      in: 'formData',
      type: 'file',
      required: true,
      description: 'Файл изображения'
    }
    #swagger.responses[200] = {
      description: 'Фото успешно загружено',
      schema: {
        url: '1234567890-photo.jpg'
      }
    }
  */
  (req: Request, res: Response) => {
    const photoUrl = `//${req.file?.filename}`;
    res.json({ url: photoUrl });
  }
);


router.post("/upload-proxy",
  /*
    #swagger.tags = ['Upload']
    #swagger.summary = 'Загрузка файлов прокси'
    #swagger.description = 'Загрузка множества файлов прокси (.txt) с отслеживанием прогресса через SSE'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.consumes = ['multipart/form-data']
    #swagger.parameters['proxies'] = {
      in: 'formData',
      type: 'file',
      required: true,
      description: 'Массив файлов прокси (txt)'
    }
    #swagger.responses[200] = {
      description: 'Server-Sent Events stream с прогрессом загрузки',
      schema: {
        progress: 100,
        status: 'completed',
        message: 'Processing complete: 3 successful, 0 failed',
        results: []
      }
    }
  */
   authMiddleware, uploadProgress, uploadProxies, async (req: AuthenticatedRequest, res) => {
    try {
      const files = Array.isArray(req.files) ? (req.files as MulterFile[]) : [];
      const userId = req.userId;

      if (!files || files.length === 0) {
        res.write(`data: ${JSON.stringify({ progress: 100, status: "error", message: "No files uploaded" })}\n\n`);
        res.end();
        return;
      }

      res.write(`data: ${JSON.stringify({
        progress: 100,
        status: "uploaded",
        message: "Files uploaded, processing..."
      })}\n\n`);

      const processedFiles = await Promise.allSettled(
        files.map(async (file, index) => {
          try {
            const processingProgress = Math.round(((index + 1) / files.length) * 100);
            res.write(`data: ${JSON.stringify({
              progress: processingProgress,
              status: "processing",
              currentFile: file.originalname,
              fileIndex: index + 1,
              totalFiles: files.length
            })}\n\n`);

            const rawProtocol = (req.body?.protocol as string | undefined)?.toLowerCase();
            const defaultProtocol =
              rawProtocol && Object.values(ProxyProtocol).includes(rawProtocol as ProxyProtocol)
                ? (rawProtocol as ProxyProtocol)
                : ProxyProtocol.HTTP;
            const proxies = await ProxyService.saveProxiesFromFile(file.path, userId!, file.filename, {
              defaultProtocol
            });
            return {
              originalName: file.originalname,
              filename: file.filename,
              path: file.path,
              count: proxies.length,
              status: "success"
            };
          } catch (error: any) {
            logger.error(`Error processing file ${file.originalname}:`, error);
            return {
              originalName: file.originalname,
              filename: file.filename,
              status: "error",
              error: error.message
            };
          }
        })
      );

      const results = processedFiles.map(result =>
        result.status === "fulfilled" ? result.value : result.reason
      );

      const successCount = results.filter(f => f.status === "success").length;
      const errorCount = results.filter(f => f.status === "error").length;

      res.write(`data: ${JSON.stringify({
        progress: 100,
        status: "completed",
        message: `Processing complete: ${successCount} successful, ${errorCount} failed`,
        results: processedFiles
      })}\n\n`);

      res.end();

    } catch (error: any) {
      logger.error("Upload error:", error);
      res.write(`data: ${JSON.stringify({
        progress: 100,
        status: "error",
        message: `Server error: ${error.message}`
      })}\n\n`);
      res.end();
    }
  }
);

const uploadBulkProxies = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  bulkProxies.array("proxies", 100)(req, res, (err: unknown) => {
    if (err) {
      const e = err as Error;
      logger.error("Bulk proxy upload error:", err);
      return res.status(400).json({ status: "error", message: e.message || "Upload failed" });
    }
    next();
  });
};

router.post("/upload-proxy-bulk", authMiddleware, uploadBulkProxies,
  /*
    #swagger.tags = ['Upload']
    #swagger.summary = 'Массовая загрузка прокси из файлов'
    #swagger.description = 'До 100 .txt файлов. Каждая строка — прокси в формате login:pass@host:port. Без пинга, bulkCreate.'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.consumes = ['multipart/form-data']
    #swagger.parameters['proxies'] = { in: 'formData', type: 'file', required: true, description: 'Файлы прокси (.txt)' }
    #swagger.parameters['protocol'] = { in: 'formData', type: 'string', required: false, description: 'http | https | socks4 | socks5 (default: http)' }
    #swagger.parameters['isRotating'] = { in: 'formData', type: 'boolean', required: false }
    #swagger.parameters['refreshUrl'] = { in: 'formData', type: 'string', required: false }
  */
  async (req: AuthenticatedRequest, res) => {
    try {
      const files = Array.isArray(req.files) ? (req.files as MulterFile[]) : [];
      const userId = req.userId;

      if (!files || files.length === 0) {
        res.status(400).json({ status: "error", message: "No files uploaded" });
        return;
      }

      const protocol = (req.body?.protocol || "http") as string;
      const isRotating = req.body?.isRotating === "true";
      const refreshUrl = req.body?.refreshUrl || undefined;

      const result = await ProxyService.bulkSaveProxiesFromFiles(
        files.map(f => f.path),
        userId!,
        protocol as any,
        { isRotating, refreshUrl }
      );

      res.status(200).json({
        status: "completed",
        created: result.created,
        skipped: result.skipped,
        parseErrors: result.errors.length,
        errors: result.errors.slice(0, 50),
        filesProcessed: files.length,
      });
    } catch (error: any) {
      logger.error("Bulk proxy upload error:", error);
      res.status(500).json({ status: "error", message: error.message });
    }
  }
);

export default router;