import { Response } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { TranslateService } from "../services/translate.service";

interface TranslateRequest {
  text: string;
}

export const translateText = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { text }: TranslateRequest = req.body;

    if (!text) {
      res.status(400).json({
        success: false,
        error: "Текст для перевода не указан"
      });
      return;
    }

    if (typeof text !== 'string' || text.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "Текст должен быть непустой строкой"
      });
      return;
    }

    if (text.length > 5000) {
      res.status(400).json({
        success: false,
        error: "Текст слишком длинный (максимум 5000 символов)"
      });
      return;
    }

    const translatedText = await TranslateService.translateText(text);

    res.status(200).json({
      success: true,
      data: {
        originalText: text,
        translatedText,
        sourceLanguage: 'de',
        targetLanguage: 'ru'
      }
    });
  } catch (error: any) {
    console.error('Ошибка перевода:', error);
    
    res.status(500).json({
      success: false,
      error: 'Ошибка при переводе текста',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};