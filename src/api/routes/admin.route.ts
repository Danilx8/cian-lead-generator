import { Router } from "express";
import { adminAuthMiddleware } from "../middlewares/admin.middleware";
import {
  runFilterById,
  runFilterParallelById,
  startSlotById,
  stopSlotById,
  startSlotsByUserId,
  stopSlotsByUserId,
  startAllSlots,
  getSlotById,
  getUserSlots,
  getAllSlots,
  getWorkerAccount,
  getPendingRegistrations,
  approveRegistration,
  rejectRegistration
} from "../controllers/admin.controller";

const router = Router();

// Run parser for filter by ID
router.post("/filter/:id/run", adminAuthMiddleware,
  /*
    #swagger.path = '/admin/filter/{id}/run'
    #swagger.tags = ['Admin']
    #swagger.summary = 'Запустить парсер для фильтра по ID (админ-ключ)'
    #swagger.parameters['id'] = { description: 'ID фильтра', in: 'path', required: true }
    #swagger.parameters['body'] = {
      in: 'body',
      required: false,
      schema: {
        type: 'object',
        properties: {
          proxy: { type: 'string', description: 'Прокси: `protocol://login:password@host:port` (рекомендуется) или legacy `host:port:login:password`. Иначе ENV PARSER_PROXY / PROXY_URL' },
          intervalMs: { type: 'integer', description: 'Интервал между итерациями в мс. По умолчанию 60000' }
        }
      }
    }
    #swagger.responses[202] = { description: 'Парсер запущен (или уже был запущен)', schema: { status: 'accepted', filterId: 1, intervalMs: 60000 } }
    #swagger.responses[401] = { description: 'Неверный админ-ключ' }
    #swagger.responses[404] = { description: 'Фильтр не найден' }
  */
  runFilterById
);

// Несколько парсеров на один filterId (без лимита «один на фильтр»; см. ADMIN_PARSER_PARALLEL_MAX_PER_REQUEST)
router.post("/filter/:id/run-parallel", adminAuthMiddleware,
  /*
    #swagger.path = '/admin/filter/{id}/run-parallel'
    #swagger.tags = ['Admin']
    #swagger.summary = 'Запустить несколько парсеров для одного фильтра (обход лимита одного экземпляра)'
    #swagger.parameters['id'] = { description: 'ID фильтра', in: 'path', required: true }
    #swagger.parameters['body'] = {
      in: 'body',
      required: false,
      schema: {
        type: 'object',
        properties: {
          proxy: { type: 'string', description: '`protocol://login:password@host:port` или legacy; иначе ENV PARSER_PROXY / PROXY_URL' },
          count: { type: 'integer', description: 'Экземпляров за запрос (по умолчанию 1; макс. из ENV ADMIN_PARSER_PARALLEL_MAX_PER_REQUEST или 500, не выше 10000)' }
        }
      }
    }
    #swagger.responses[202] = { description: 'Экземпляры поставлены в очередь оркестратору' }
  */
  runFilterParallelById
);

// Single slot control
router.post("/slots/:workerId/start", adminAuthMiddleware,
  /*
    #swagger.path = '/admin/slots/{workerId}/start'
    #swagger.tags = ['Admin']
    #swagger.summary = 'Запустить один слот (воркера) по ID'
    #swagger.parameters['workerId'] = { in: 'path', required: true, type: 'integer' }
    #swagger.responses[202] = { description: 'Запуск инициирован или уже запущен', schema: { status: 'accepted', workerId: 1, alreadyRunning: true } }
  */
  startSlotById
);

router.post("/slots/:workerId/stop", adminAuthMiddleware,
  /*
    #swagger.path = '/admin/slots/{workerId}/stop'
    #swagger.tags = ['Admin']
    #swagger.summary = 'Остановить один слот (воркера) по ID'
    #swagger.parameters['workerId'] = { in: 'path', required: true, type: 'integer' }
    #swagger.responses[200] = { description: 'Остановлен или уже был остановлен', schema: { status: 'ok', workerId: 1, alreadyStopped: true } }
  */
  stopSlotById
);

// Per-user bulk control
router.post("/users/:userId/slots/start", adminAuthMiddleware,
  /*
    #swagger.path = '/admin/users/{userId}/slots/start'
    #swagger.tags = ['Admin']
    #swagger.summary = 'Массовый запуск слотов пользователя'
    #swagger.parameters['userId'] = { in: 'path', required: true, type: 'integer' }
    #swagger.responses[202] = { description: 'Принято', schema: { status: 'accepted', userId: 1, started: [1], skipped: [2], failed: [{ id: 3, reason: '...'}] } }
  */
  startSlotsByUserId
);

router.post("/users/:userId/slots/stop", adminAuthMiddleware,
  /*
    #swagger.path = '/admin/users/{userId}/slots/stop'
    #swagger.tags = ['Admin']
    #swagger.summary = 'Массовая остановка слотов пользователя'
    #swagger.parameters['userId'] = { in: 'path', required: true, type: 'integer' }
    #swagger.responses[200] = { description: 'OK', schema: { status: 'ok', userId: 1, stopped: [1], skipped: [2], failed: [{ id: 3, reason: '...'}] } }
  */
  stopSlotsByUserId
);

// Global bulk control
router.post("/slots/start-all", adminAuthMiddleware,
  /*
    #swagger.path = '/admin/slots/start-all'
    #swagger.tags = ['Admin']
    #swagger.summary = 'Глобальный запуск всех слотов'
    #swagger.responses[202] = { description: 'Принято', schema: { status: 'accepted', started: [1], skipped: [2], failed: [{ id: 3, reason: '...'}] } }
  */
  startAllSlots
);

// Read endpoints (GET)
router.get("/slots/:workerId", adminAuthMiddleware,
  /*
    #swagger.path = '/admin/slots/{workerId}'
    #swagger.tags = ['Admin']
    #swagger.summary = 'Получить данные конкретного слота (воркера)'
    #swagger.parameters['workerId'] = { in: 'path', required: true, type: 'integer' }
  */
  getSlotById
);

router.get("/users/:userId/slots", adminAuthMiddleware,
  /*
    #swagger.path = '/admin/users/{userId}/slots'
    #swagger.tags = ['Admin']
    #swagger.summary = 'Получить все слоты пользователя (опционально фильтрация по статусам)'
    #swagger.parameters['userId'] = { in: 'path', required: true, type: 'integer' }
    #swagger.parameters['status'] = { in: 'query', required: false, type: 'string', description: 'Статусы через запятую, например ACTIVE,RECONNECTING' }
  */
  getUserSlots
);

router.get("/slots", adminAuthMiddleware,
  /*
    #swagger.path = '/admin/slots'
    #swagger.tags = ['Admin']
    #swagger.summary = 'Получить все слоты в системе (опционально фильтрация по статусам и userId)'
    #swagger.parameters['status'] = { in: 'query', required: false, type: 'string', description: 'Статусы через запятую, например SHUTDOWN,ACTIVE' }
    #swagger.parameters['userId'] = { in: 'query', required: false, type: 'integer', description: 'Ограничить выборку определённым пользователем' }
  */
  getAllSlots
);

// Модерация заявок на регистрацию (ВКР §1.7)
router.get("/registrations", adminAuthMiddleware,
  /*
    #swagger.path = '/admin/registrations'
    #swagger.tags = ['Admin']
    #swagger.summary = 'Список заявок на регистрацию, ожидающих одобрения'
  */
  getPendingRegistrations
);

router.post("/registrations/:userId/approve", adminAuthMiddleware,
  /*
    #swagger.path = '/admin/registrations/{userId}/approve'
    #swagger.tags = ['Admin']
    #swagger.summary = 'Одобрить заявку на регистрацию'
    #swagger.parameters['userId'] = { in: 'path', required: true, type: 'integer' }
  */
  approveRegistration
);

router.post("/registrations/:userId/reject", adminAuthMiddleware,
  /*
    #swagger.path = '/admin/registrations/{userId}/reject'
    #swagger.tags = ['Admin']
    #swagger.summary = 'Отклонить заявку на регистрацию'
    #swagger.parameters['userId'] = { in: 'path', required: true, type: 'integer' }
  */
  rejectRegistration
);

// Account endpoint for workers
router.get("/workers/:workerId/account", adminAuthMiddleware,
  /*
    #swagger.path = '/admin/workers/{workerId}/account'
    #swagger.tags = ['Admin']
    #swagger.summary = 'Получить аккаунт воркера'
    #swagger.parameters['workerId'] = { in: 'path', required: true, type: 'integer' }
    #swagger.responses[200] = { description: 'Данные аккаунта', schema: { login: '', name: '' } }
    #swagger.responses[404] = { description: 'Worker или аккаунт не найдены' }
  */
  getWorkerAccount
);

export default router;
