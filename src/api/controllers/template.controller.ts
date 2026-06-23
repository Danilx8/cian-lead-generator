import { Response } from "express";
import { TemplateService } from "../services/template.service";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";

// Получить все шаблоны текущего пользователя
export const getMyTemplates = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId;

  const templates = await TemplateService.getUserTemplates(userId!);
  res.json({ templates });
};

// Добавить новый шаблон
export const addTemplate = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { title, texts, isGreeting, isSentWithQr, isAutomatic, isSentImmediately, isSentForEmail, isSentForPayPal } = req.body;
  const userId = req.userId;

  if (!title || !texts) {
    res.status(400).json({ error: "Title and text are required" });
    return;
  }

  if (typeof title !== "string" || !Array.isArray(texts) || !texts.every(item => typeof item === "string")) {
    res.status(400).json({ error: "Title must be string and text must be array of strings" });
    return;
  }

  const templates = await TemplateService.addTemplate(userId!, {
    title,
    texts: texts,
    isGreeting,
    isSentWithQr,
    isAutomatic,
    isSentImmediately,
    isSentForEmail,
    isSentForPayPal
  });
  res.status(201).json({
    message: "Template added successfully",
    templates
  });
};

// Обновить шаблон по индексу
export const updateTemplate = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { index } = req.params;
  const { title, texts, isGreeting, isSentWithQr, isAutomatic, isSentImmediately, isSentForEmail, isSentForPayPal } = req.body;
  const userId = req.userId;

  const templateIndex = parseInt(index);
  if (isNaN(templateIndex) || templateIndex < 0) {
    res.status(400).json({ error: "Invalid template index" });
    return;
  }

  if (!title || !texts) {
    res.status(400).json({ error: "Title and text are required" });
    return;
  }

  if (typeof title !== "string" || !Array.isArray(texts) || !texts.every(item => typeof item === "string")) {
    res.status(400).json({ error: "Title must be string and text must be array of strings" });
    return;
  }

  const templates = await TemplateService.updateTemplate(userId!, templateIndex, {
    title,
    texts: texts,
    isGreeting,
    isAutomatic,
    isSentWithQr,
    isSentImmediately,
    isSentForEmail,
    isSentForPayPal
  });
  res.json({
    message: "Template updated successfully",
    templates
  });
};

// Удалить шаблон по индексу
export const removeTemplate = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { index } = req.params;
  const userId = req.userId;

  const templateIndex = parseInt(index);
  if (isNaN(templateIndex) || templateIndex < 0) {
    res.status(400).json({ error: "Invalid template index" });
    return;
  }

  const templates = await TemplateService.removeTemplate(userId!, templateIndex);
  res.json({
    message: "Template removed successfully",
    templates
  });
};

// Изменить порядок шаблонов
export const reorderTemplates = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { fromIndex, toIndex } = req.body;
  const userId = req.userId;

  if (typeof fromIndex !== "number" || typeof toIndex !== "number" ||
    fromIndex < 0 || toIndex < 0) {
    res.status(400).json({ error: "Valid fromIndex and toIndex are required" });
    return;
  }

  const templates = await TemplateService.reorderTemplates(userId!, fromIndex, toIndex);
  res.json({
    message: "Templates reordered successfully",
    templates
  });
};

// Получить конкретный шаблон по индексу
export const getTemplate = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { index } = req.params;
  const userId = req.userId;

  const templateIndex = parseInt(index);
  if (isNaN(templateIndex) || templateIndex < 0) {
    res.status(400).json({ error: "Invalid template index" });
    return;
  }

  const template = await TemplateService.getTemplate(userId!, templateIndex);

  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  res.json({ template });
};

// Очистить все шаблоны пользователя
export const clearTemplates = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId;

  await TemplateService.clearUserTemplates(userId!);
  res.json({
    message: "All templates cleared successfully",
    templates: []
  });
};

// Получить количество шаблонов
export const getTemplatesCount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId;

  const count = await TemplateService.getTemplatesCount(userId!);
  res.json({ count });
};

export const getManualTemplates = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.userId;

  const templates = await TemplateService.getManualTemplates(userId!);
  if (!templates) res.status(204).json({ error: "Templates not found" });
  else res.status(200).json({ templates });
};