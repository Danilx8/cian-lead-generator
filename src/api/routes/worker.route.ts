import express from "express";
import {
  attachFilter,
  continueWorker,
  createWorker,
  deleteWorker,
  getAllWorkers,
  getWorkerMetadata,
  pauseWorker,
  runWorker,
  runWorkers,
  seeLogs,
  sendMessageToWorker,
  shutdownWorker,
  updateWorker,
  applyWorkerPhone,
  verifyWorkerPhoneCode
} from "../controllers/worker.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = express.Router();

router.get("/:workerId", authMiddleware,
  /*
    #swagger.path = '/worker/{workerId}'
    #swagger.tags = ['Worker']
    #swagger.summary = 'Получить метаданные воркера'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.parameters['workerId'] = {
      in: 'path',
      required: true,
      type: 'integer'
    }
    #swagger.responses[200] = {
      description: 'Метаданные воркера успешно получены',
      schema: {
        type: 'object',
        properties: {
          platform: { type: 'string' },
          browser: { type: 'string' },
          browserCore: { type: 'string' },
          filter: { type: 'string' },
          createdAt: { type: 'string' },
          updatedAt: { type: 'string' }
        }
      }
    }
  */
  getWorkerMetadata
);

router.delete("/:workerId", authMiddleware,
  /*
    #swagger.path = '/worker/{workerId}'
    #swagger.tags = ['Worker']
    #swagger.summary = 'Удалить воркера (выход из аккаунта)'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.parameters['workerId'] = {
      in: 'path',
      required: true,
      type: 'integer'
    }
    #swagger.responses[200] = {
      description: 'Воркер успешно удалён'
    }
  */
  deleteWorker
);

router.post("/shutdown/:workerId", authMiddleware,
  /*
    #swagger.path = '/worker/shutdown/{workerId}'
    #swagger.tags = ['Worker']
    #swagger.summary = 'Остановить воркера (выход из аккаунта)'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.parameters['workerId'] = {
      in: 'path',
      required: true,
      type: 'integer'
    }
    #swagger.responses[200] = {
      description: 'Воркер успешно остановлен'
    }
  */
  shutdownWorker
);

router.post("/pause/:workerId", authMiddleware,
  /*
    #swagger.path = '/worker/pause/{workerId}'
    #swagger.tags = ['Worker']
    #swagger.summary = 'Приостановить воркера'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.parameters['workerId'] = {
      in: 'path',
      required: true,
      type: 'integer'
    }
    #swagger.responses[200] = {
      description: 'Воркер успешно приостановлен'
    }
  */
  pauseWorker
);

router.post("/continue/:workerId", authMiddleware,
  /*
    #swagger.path = '/worker/continue/{workerId}'
    #swagger.tags = ['Worker']
    #swagger.summary = 'Продолжить работу воркера'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.parameters['workerId'] = {
      in: 'path',
      required: true,
      type: 'integer'
    }
    #swagger.responses[200] = {
      description: 'Воркер успешно продолжен'
    }
  */
  continueWorker
);

router.get("/", authMiddleware,
  /*
    #swagger.path = '/worker/'
    #swagger.tags = ['Worker']
    #swagger.summary = 'Получить все воркеры пользователя'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.responses[200] = {
      description: 'Список всех воркеров пользователя',
      schema: { type: 'array' }
    }
  */
  getAllWorkers
);

router.post("/", authMiddleware,
  /*
    #swagger.path = '/worker/'
    #swagger.tags = ['Worker']
    #swagger.summary = 'Создать воркера'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.parameters['body'] = {
      in: 'body',
      required: true,
      schema: {
        type: 'object',
        properties: {
          amount: { type: 'integer', description: 'Сколько слотов создать (по умолчанию 1)' },
          profileOptions: {
            type: 'object',
            properties: {
              browserOption: { type: 'string' },
              browserCore: { type: 'string' },
              operatorSystemId: { type: 'string' },
              userAgent: { type: 'string' },
              filterOptions: {
                type: 'object',
                properties: { id: { type: 'integer' } }
              }
            }
          }
        },
        required: ['profileOptions']
      }
    }
    #swagger.responses[200] = {
      description: 'Воркер успешно создан'
    }
  */
  createWorker
);

router.post("/start", authMiddleware,
  /*
    #swagger.path = '/worker/start'
    #swagger.tags = ['Worker']
    #swagger.summary = 'Запустить все воркеры пользователя'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.responses[202] = {
      description: 'Запуск поставлен в очередь (обрабатывается последовательно на сервере)',
      schema: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'queued' },
          queued: { type: 'array', items: { type: 'integer' } },
          skipped: { type: 'array', items: { type: 'integer' } },
          duplicatePending: { type: 'array', items: { type: 'integer' } }
        }
      }
    }
  */
  runWorkers
);

router.post("/start/:workerId", authMiddleware,
  /*
    #swagger.path = '/worker/start/{workerId}'
    #swagger.tags = ['Worker']
    #swagger.summary = 'Запустить конкретный воркер'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.parameters['workerId'] = {
      in: 'path',
      required: true,
      type: 'integer'
    }
    #swagger.responses[202] = {
      description: 'Запрос принят; фактический запуск в общей очереди'
    }
  */
  runWorker
);

router.post("/phone/apply/:workerId", authMiddleware,
  /*
    #swagger.path = '/worker/phone/apply/{workerId}'
    #swagger.tags = ['Worker']
    #swagger.summary = 'Привязать номер телефона к слоту (отправка VERIFY воркеру)'
    #swagger.description = 'Тело: полный номер с кодом страны через +. На воркер уходит VERIFY; если статус слота EXPECTING_CODE — перед VERIFY дополнительно отправляется REVERIFY.'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.parameters['workerId'] = {
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
          phone: {
            type: 'string',
            example: '+4915112345678',
            description: 'Международный формат, с + и кодом страны'
          }
        },
        required: ['phone']
      }
    }
    #swagger.responses[202] = {
      description: 'Команды поставлены воркеру',
      schema: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'queued' },
          countryCode: { type: 'string', example: '49' },
          phoneNumber: { type: 'string', description: 'Национальная часть без кода страны' }
        }
      }
    }
    #swagger.responses[400] = {
      description: 'Неверный worker id, отсутствует phone или некорректный формат номера'
    }
    #swagger.responses[404] = {
      description: 'Воркер не найден'
    }
  */
  applyWorkerPhone
);

router.post("/phone/verify/:workerId", authMiddleware,
  /*
    #swagger.path = '/worker/phone/verify/{workerId}'
    #swagger.tags = ['Worker']
    #swagger.summary = 'Подтвердить номер кодом из SMS'
    #swagger.description = 'Отправляет воркеру команду CODE с кодом из SMS.'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.parameters['workerId'] = {
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
          code: { type: 'string', example: '123456', description: 'Код из SMS' }
        },
        required: ['code']
      }
    }
    #swagger.responses[202] = {
      description: 'Команда отправлена воркеру'
    }
    #swagger.responses[400] = {
      description: 'Неверный worker id или отсутствует code'
    }
    #swagger.responses[404] = {
      description: 'Воркер не найден'
    }
  */
  verifyWorkerPhoneCode
);

router.post("/message/:workerId", authMiddleware,
  /*
    #swagger.path = '/worker/message/{workerId}'
    #swagger.tags = ['Worker']
    #swagger.summary = 'Отправить сообщение воркеру'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.parameters['workerId'] = {
      in: 'path',
      required: true,
      type: 'integer'
    }
    #swagger.parameters['body'] = {
      in: 'body',
      required: true,
      schema: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message']
      }
    }
    #swagger.responses[200] = {
      description: 'Сообщение успешно отправлено'
    }
  */
  sendMessageToWorker
);

router.get("/logs/:workerId", authMiddleware,
  /*
    #swagger.path = '/worker/logs/{workerId}'
    #swagger.tags = ['Worker']
    #swagger.summary = 'Получить логи воркера'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.parameters['workerId'] = {
      in: 'path',
      required: true,
      type: 'integer'
    }
    #swagger.responses[200] = {
      description: 'Логи воркера',
      schema: { type: 'string' }
    }
  */
  seeLogs
);

router.post("/attachFilter/:workerId", authMiddleware,
  /*
    #swagger.path = '/worker/attachFilter/{workerId}'
    #swagger.tags = ['Worker']
    #swagger.summary = 'Привязать фильтр к воркеру'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.parameters['workerId'] = {
      in: 'path',
      required: true,
      type: 'integer'
    }
    #swagger.parameters['body'] = {
      in: 'body',
      required: true,
      schema: {
        type: 'object',
        properties: { filterId: { type: 'integer' } },
        required: ['filterId']
      }
    }
    #swagger.responses[200] = {
      description: 'Фильтр успешно привязан'
    }
  */
  attachFilter
);

router.patch("/:workerId", authMiddleware,
  /*
    #swagger.path = '/worker/{workerId}'
    #swagger.tags = ['Worker']
    #swagger.summary = 'Обновить настройки воркера'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.parameters['workerId'] = {
      in: 'path',
      required: true,
      type: 'integer'
    }
    #swagger.parameters['body'] = {
      in: 'body',
      required: false,
      schema: {
        type: 'object',
        properties: {
          isActive: { type: 'boolean' },
          browserType: { type: 'integer' },
          browserCore: { type: 'integer' },
          operationSystem: { type: 'integer' },
          userAgent: { type: 'string' },
          filterId: { type: 'integer' }
        }
      }
    }
    #swagger.responses[200] = {
      description: 'Воркер успешно обновлён',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          isActive: { type: 'boolean' },
          browserType: { type: 'integer' },
          browserCore: { type: 'integer' },
          operationSystem: { type: 'integer' },
          userAgent: { type: 'string' },
          filterId: { type: 'integer' }
        }
      }
    }
    #swagger.responses[404] = {
      description: 'Воркер не найден'
    }
    #swagger.responses[400] = {
      description: 'Неверные данные'
    }
  */
  updateWorker
);

export default router;