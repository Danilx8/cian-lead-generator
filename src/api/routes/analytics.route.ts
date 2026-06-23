import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { getAnalyticsSummary, getAnalyticsReportCsv } from "../controllers/analytics.controller";

const router = Router();

router.get("/summary", authMiddleware,
  /*
    #swagger.path = '/analytics/summary'
    #swagger.tags = ['Analytics']
    #swagger.summary = 'Сводные метрики и воронка лидогенерации'
    #swagger.description = 'Обычный пользователь видит свои данные; администратор может указать ?userId=N или ?global=1.'
    #swagger.security = [{ "bearerAuth": [] }]
  */
  getAnalyticsSummary
);

router.get("/report.csv", authMiddleware,
  /*
    #swagger.path = '/analytics/report.csv'
    #swagger.tags = ['Analytics']
    #swagger.summary = 'Экспорт сводного отчёта в CSV'
    #swagger.security = [{ "bearerAuth": [] }]
  */
  getAnalyticsReportCsv
);

export default router;
