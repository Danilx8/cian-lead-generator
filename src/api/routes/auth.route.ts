import { Router } from "express";
import { register, login, me, logout, refresh } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.post("/register",
  /*
    #swagger.path = '/auth/register'
    #swagger.tags = ['Auth']
    #swagger.summary = 'Регистрация нового пользователя'
    #swagger.parameters['body'] = {
      in: 'body',
      required: true,
      schema: {
        type: 'object',
        properties: {
          email: { type: 'string', example: 'user@example.com' },
          password: { type: 'string', example: 'securePassword123' },
          username: { type: 'string', example: 'john_doe' }
        },
        required: ['email', 'password', 'username']
      }
    }
  */
  register
);

router.post("/login",
  /*
    #swagger.path = '/auth/login'
    #swagger.tags = ['Auth']
    #swagger.summary = 'Вход по email и паролю'
    #swagger.parameters['body'] = {
      in: 'body',
      required: true,
      schema: {
        type: 'object',
        properties: {
          email: { type: 'string', example: 'user@example.com' },
          password: { type: 'string', example: 'securePassword123' }
        },
        required: ['email', 'password']
      }
    }
  */
  login
);

router.post("/refresh",
  /*
    #swagger.path = '/auth/refresh'
    #swagger.tags = ['Auth']
    #swagger.summary = 'Обновление access-токена по refresh-токену'
  */
  refresh
);

router.post("/logout",
  /*
    #swagger.path = '/auth/logout'
    #swagger.tags = ['Auth']
    #swagger.summary = 'Выход из системы (отзыв refresh-токена)'
  */
  logout
);

router.get("/me", authMiddleware,
  /*
    #swagger.path = '/auth/me'
    #swagger.tags = ['Auth']
    #swagger.summary = 'Получение данных текущего пользователя'
    #swagger.security = [{ "bearerAuth": [] }]
  */
  me
);

export default router;
