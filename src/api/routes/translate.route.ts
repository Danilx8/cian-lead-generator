import { Router } from "express";
import { translateText } from "../controllers/translate.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const translateRouter = Router();

/**
 * @route POST /api/translate
 * @description Перевод текста с немецкого на русский
 * @access Protected (требует JWT токен)
 */
translateRouter.post('/', authMiddleware, translateText);

export default translateRouter;
