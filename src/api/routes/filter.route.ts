import express from "express";
import {
  createFilter,
  deleteFilter,
  generateFilterUrl,
  getUsersFilters,
  updateFilter
} from "../controllers/filter.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = express.Router();

router.get("/", authMiddleware,
  /*
    #swagger.path = '/filter/'
    #swagger.tags = ['Filters']
    #swagger.summary = 'Получить все фильтры пользователя'
    #swagger.security = [{ "bearerAuth": [] }]
  */
  getUsersFilters
);

router.post("/link", authMiddleware,
  /*
    #swagger.path = '/filter/link'
    #swagger.tags = ['Filters']
    #swagger.summary = 'Сгенерировать URL фильтра Авито'
    #swagger.security = [{ "bearerAuth": [] }]
  */
  generateFilterUrl
);

router.post("/", authMiddleware,
  /*
    #swagger.path = '/filter/'
    #swagger.tags = ['Filters']
    #swagger.summary = 'Создать фильтр'
    #swagger.security = [{ "bearerAuth": [] }]
    #swagger.parameters['body'] = {
      in: 'body',
      required: true,
      schema: {
        type: 'object',
        properties: {
          filterOptions: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              parsingLink: { type: 'string', example: 'https://www.cian.ru/moskva/kvartiry/prodam', description: 'URL(s) for Cian search, comma-separated' },
              whiteList: { type: 'array', items: { type: 'string' } },
              blackList: { type: 'array', items: { type: 'string' } },
              adsLimit: { type: 'integer' },
              maxDateRegistered: { type: 'string', format: 'date' }
            },
            required: ['parsingLink']
          }
        },
        required: ['filterOptions']
      }
    }
  */
  createFilter
);

router.patch("/:id", authMiddleware,
  /*
    #swagger.path = '/filter/{id}'
    #swagger.tags = ['Filters']
    #swagger.summary = 'Обновить фильтр'
    #swagger.security = [{ "bearerAuth": [] }]
  */
  updateFilter
);

router.delete("/:id", authMiddleware,
  /*
    #swagger.path = '/filter/{id}'
    #swagger.tags = ['Filters']
    #swagger.summary = 'Удалить фильтр'
    #swagger.security = [{ "bearerAuth": [] }]
  */
  deleteFilter
);

export default router;
