import { Router } from "express";
import {
  getUserById,
  updateUser,
  getUserByWorkerId,
  getAllUsers
} from "../controllers/user.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.get("/id/:id", authMiddleware,
  /*
    #swagger.path = '/user/id/{id}'
    #swagger.tags = ['User']
    #swagger.summary = 'Получить пользователя по ID'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.parameters['id'] = {
      in: 'path',
      required: true,
      type: 'integer'
    }
    #swagger.responses[200] = {
      description: 'Пользователь успешно получен',
      schema: { type: 'object' }
    }
  */
  getUserById
);

router.get("/worker/:id", authMiddleware,
  /*
    #swagger.path = '/user/worker/{id}'
    #swagger.tags = ['User']
    #swagger.summary = 'Получить пользователя по worker ID'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.parameters['id'] = {
      in: 'path',
      required: true,
      type: 'integer'
    }
    #swagger.responses[200] = {
      description: 'Пользователь успешно получен',
      schema: { type: 'object' }
    }
  */
  getUserByWorkerId
);

router.get("/all", authMiddleware,
  /*
    #swagger.path = '/user/all'
    #swagger.tags = ['User']
    #swagger.summary = 'Получить всех пользователей'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.responses[200] = {
      description: 'Список всех пользователей',
      schema: { type: 'array', items: { type: 'object' } }
    }
  */
  getAllUsers
);

router.patch("/:id", authMiddleware,
  /*
    #swagger.path = '/user/{id}'
    #swagger.tags = ['User']
    #swagger.summary = 'Обновить пользователя'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.parameters['id'] = {
      in: 'path',
      required: true,
      type: 'integer'
    }
    #swagger.parameters['body'] = {
      in: 'body',
      schema: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          status: { type: 'string', enum: ['active', 'pending', 'blocked'] },
          role: { type: 'string', enum: ['user', 'admin'] },
          sendWithAngebot: { type: 'string' },
          visionFolderId: { type: 'string' },
          avatarPath: { type: 'string' },
          itemsChunkSize: { type: 'integer' },
          itemsInterval: { type: 'integer' },
          newMessagesInterval: { type: 'integer' },
          chunksInterval: { type: 'integer' },
          repliesInterval: { type: 'integer' }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Пользователь успешно обновлен',
      schema: { type: 'object' }
    }
  */
  updateUser
);

export default router;
