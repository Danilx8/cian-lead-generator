import express from "express";
import {
  changeDialogMode,
  deleteDialogs,
  getAllDialogs,
  listDialogMessages,
  searchDialogs,
  sendMessage,
} from "../controllers/dialog.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = express.Router();

router.get("/", authMiddleware,
  /*
    #swagger.path = '/dialogs/'
    #swagger.tags = ['Dialogs']
    #swagger.summary = 'Получить все диалоги с пагинацией'
    #swagger.security = [{ "bearerAuth": [] }]
  */
  getAllDialogs
);

router.get("/search", authMiddleware,
  /*
    #swagger.path = '/dialogs/search'
    #swagger.tags = ['Dialogs']
    #swagger.summary = 'Поиск диалогов'
    #swagger.security = [{ "bearerAuth": [] }]
  */
  searchDialogs
);

router.get("/:dialogId", authMiddleware,
  /*
    #swagger.path = '/dialogs/{dialogId}'
    #swagger.tags = ['Dialogs']
    #swagger.summary = 'Получить сообщения диалога'
    #swagger.security = [{ "bearerAuth": [] }]
  */
  listDialogMessages
);

router.post("/:dialogId", authMiddleware,
  /*
    #swagger.path = '/dialogs/{dialogId}'
    #swagger.tags = ['Dialogs']
    #swagger.summary = 'Изменить режим диалога'
    #swagger.security = [{ "bearerAuth": [] }]
  */
  changeDialogMode
);

router.post("/send/:dialogId", authMiddleware,
  /*
    #swagger.path = '/dialogs/send/{dialogId}'
    #swagger.tags = ['Dialogs']
    #swagger.summary = 'Отправить сообщение в диалог'
    #swagger.security = [{ "bearerAuth": [] }]
  */
  sendMessage
);

router.delete("/", authMiddleware,
  /*
    #swagger.path = '/dialogs'
    #swagger.tags = ['Dialogs']
    #swagger.summary = 'Удалить диалоги'
    #swagger.security = [{ "bearerAuth": [] }]
  */
  deleteDialogs
);

export default router;
