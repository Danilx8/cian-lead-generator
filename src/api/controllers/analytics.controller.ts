import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { isAdminRequest } from "../middlewares/admin.middleware";
import AnalyticsService from "../services/analytics.service";

/**
 * Определяет область видимости аналитики:
 *  - администратор: ?global=1 → вся система; ?userId=N → конкретный пользователь; иначе сам;
 *  - обычный пользователь: всегда только свои данные.
 */
async function resolveScopeUserId(req: AuthenticatedRequest): Promise<number | undefined> {
  const admin = await isAdminRequest(req);
  if (admin) {
    if (["1", "true", "yes"].includes(String(req.query.global || "").toLowerCase())) return undefined;
    if (req.query.userId) return Number(req.query.userId);
  }
  return req.userId;
}

export const getAnalyticsSummary = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = await resolveScopeUserId(req);
    const summary = await AnalyticsService.getSummary(userId);
    res.status(200).json(summary);
  } catch (err) {
    next(err);
  }
};

export const getAnalyticsReportCsv = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = await resolveScopeUserId(req);
    const summary = await AnalyticsService.getSummary(userId);
    const rows = AnalyticsService.summaryToCsvRows(summary);

    const csv = ["metric;value", ...rows.map(([k, v]) => `${k};${v}`)].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="analytics-report.csv"');
    res.status(200).send(csv);
  } catch (err) {
    next(err);
  }
};
