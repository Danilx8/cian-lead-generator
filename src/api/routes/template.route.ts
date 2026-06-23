import express from "express";
import {
  getMyTemplates,
  addTemplate,
  updateTemplate,
  removeTemplate,
  reorderTemplates,
  getTemplate,
  clearTemplates,
  getTemplatesCount,
  getManualTemplates
} from "../controllers/template.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = express.Router();

router.use(authMiddleware);

router.get("/",
  /*
  #swagger.tags = ['Templates']
  #swagger.summary = 'Получить все шаблоны пользователя'
  #swagger.security = [{ "bearerAuth": [] }]
  #swagger.responses[200] = {
    schema: {
      templates: []
    }
  }
*/
  getMyTemplates);

router.get("/count",
  /*
  #swagger.tags = ['Templates']
  #swagger.summary = 'Получить количество шаблонов'
  #swagger.security = [{ "bearerAuth": [] }]
  #swagger.responses[200] = {
    schema: {
      count: 5
    }
  }
*/
  getTemplatesCount);

router.get("/manual",
  /*
  #swagger.tags = ['Templates']
  #swagger.summary = 'Получить ручные шаблоны'
  #swagger.security = [{ "bearerAuth": [] }]
  #swagger.responses[200] = {
    schema: {
      templates: []
    }
  }
*/
  getManualTemplates);

router.get("/:index", /*
  #swagger.tags = ['Templates']
  #swagger.summary = 'Получить шаблон по индексу'
  #swagger.security = [{ "bearerAuth": [] }]
  #swagger.parameters['index'] = {
    in: 'path',
    required: true,
    type: 'integer'
  }
  #swagger.responses[200] = {
    schema: {
      template: {
        title: 'Приветствие',
        text: 'Здравствуйте!',
        isGreeting: true,
        isSentWithQr: false,
        isAutomatic: false,
        isSentImmediately: false,
        isSentForEmail: false
      }
    }
  }
  #swagger.responses[404] = {
    description: 'Шаблон не найден'
  }
*/
  getTemplate);

router.post("/", /*
  #swagger.tags = ['Templates']
  #swagger.summary = 'Добавить новый шаблон'
  #swagger.security = [{ "bearerAuth": [] }]
  #swagger.parameters['body'] = {
    in: 'body',
    required: true,
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', example: 'Приветствие' },
        text: { type: 'string', example: 'Здравствуйте!' },
        isGreeting: { type: 'boolean', example: true },
        isSentWithQr: { type: 'boolean', example: false },
        isAutomatic: { type: 'boolean', example: false },
        isSentImmediately: { type: 'boolean', example: false },
        isSentForEmail: { type: 'boolean', example: false }
      },
      required: ['title', 'text']
    }
  }
  #swagger.responses[201] = {
    schema: {
      message: 'Template added successfully',
      templates: []
    }
  }
*/
  addTemplate);

router.post("/reorder",
  /*
  #swagger.tags = ['Templates']
  #swagger.summary = 'Изменить порядок шаблонов'
  #swagger.security = [{ "bearerAuth": [] }]
  #swagger.parameters['body'] = {
    in: 'body',
    required: true,
    schema: {
      type: 'object',
      properties: {
        fromIndex: { type: 'integer', example: 0 },
        toIndex: { type: 'integer', example: 2 }
      },
      required: ['fromIndex', 'toIndex']
    }
  }
  #swagger.responses[200] = {
    schema: {
      message: 'Templates reordered successfully',
      templates: []
    }
  }
*/
  reorderTemplates);

router.put("/:index", /*
  #swagger.tags = ['Templates']
  #swagger.summary = 'Обновить шаблон'
  #swagger.security = [{ "bearerAuth": [] }]
  #swagger.parameters['index'] = {
    in: 'path',
    required: true,
    type: 'integer'
  }
  #swagger.parameters['body'] = {
    in: 'body',
    required: true,
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        text: { type: 'string' },
        isGreeting: { type: 'boolean' },
        isSentWithQr: { type: 'boolean' },
        isAutomatic: { type: 'boolean' },
        isSentImmediately: { type: 'boolean' },
        isSentForEmail: { type: 'boolean' }
      },
      required: ['title', 'text']
    }
  }
  #swagger.responses[200] = {
    schema: {
      message: 'Template updated successfully',
      templates: []
    }
  }
*/
  updateTemplate);

router.delete("/:index", /*
  #swagger.tags = ['Templates']
  #swagger.summary = 'Удалить шаблон'
  #swagger.security = [{ "bearerAuth": [] }]
  #swagger.parameters['index'] = {
    in: 'path',
    required: true,
    type: 'integer'
  }
  #swagger.responses[200] = {
    schema: {
      message: 'Template removed successfully',
      templates: []
    }
  }
*/
  removeTemplate);

router.delete("/",
  /*
  #swagger.tags = ['Templates']
  #swagger.summary = 'Очистить все шаблоны'
  #swagger.security = [{ "bearerAuth": [] }]
  #swagger.responses[200] = {
    schema: {
      message: 'All templates cleared successfully',
      templates: []
    }
  }
*/
  clearTemplates);

export default router;