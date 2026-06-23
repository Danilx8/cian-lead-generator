import Template, { ITemplateItem } from "../../database/template.model";

export class TemplateService {
  // Получить все шаблоны пользователя по userId
  public static async getUserTemplates(userId: number) {
    const userTemplates = await Template.findOne({ where: { userId } });
    return userTemplates?.templates || [];
  }

  // Получить запись шаблонов пользователя (создать если не существует)
  public static async getOrCreateUserTemplateRecord(userId: number) {
    let userTemplates = await Template.findOne({ where: { userId } });

    if (!userTemplates) {
      userTemplates = await Template.create({ userId, templates: [] });
    }

    return userTemplates;
  }

  // Добавить новый шаблон
  public static async addTemplate(userId: number, templateItem: ITemplateItem) {
    const userTemplates = await this.getOrCreateUserTemplateRecord(userId);
    await userTemplates.addTemplate(templateItem);
    await userTemplates.reload();
    return userTemplates.templates;
  }

  // Удалить шаблон по индексу
  public static async removeTemplate(userId: number, index: number) {
    const userTemplates = await Template.findOne({ where: { userId } });

    if (!userTemplates) {
      throw new Error("User templates not found");
    }

    await userTemplates.removeTemplate(index);
    await userTemplates.reload();
    return userTemplates.templates;
  }

  // Обновить шаблон по индексу
  public static async updateTemplate(userId: number, index: number, templateItem: ITemplateItem) {
    const userTemplates = await Template.findOne({ where: { userId } });

    if (!userTemplates) {
      throw new Error("User templates not found");
    }

    await userTemplates.updateTemplate(index, templateItem);
    await userTemplates.reload();
    return userTemplates.templates;
  }

  // Изменить порядок шаблонов
  public static async reorderTemplates(userId: number, fromIndex: number, toIndex: number) {
    const userTemplates = await Template.findOne({ where: { userId } });

    if (!userTemplates) {
      throw new Error("User templates not found");
    }

    await userTemplates.reorderTemplates(fromIndex, toIndex);
    await userTemplates.reload();
    return userTemplates.templates;
  }

  // Получить шаблон по индексу
  public static async getTemplate(userId: number, index: number) {
    const userTemplates = await Template.findOne({ where: { userId } });

    if (!userTemplates) {
      return null;
    }

    return userTemplates.getTemplate(index);
  }

  // Получить количество шаблонов пользователя
  public static async getTemplatesCount(userId: number) {
    const userTemplates = await Template.findOne({ where: { userId } });
    return userTemplates?.getTemplatesCount() || 0;
  }

  // Получить все записи шаблонов (для админских целей)
  public static async getAllTemplateRecords() {
    return await Template.findAll();
  }

  // Удалить все шаблоны пользователя
  public static async clearUserTemplates(userId: number) {
    const userTemplates = await Template.findOne({ where: { userId } });

    if (userTemplates) {
      await userTemplates.update({ templates: [] });
      return true;
    }

    return false;
  }

  public static async getAutomaticReplyTemplates(userId: number) {
    const userTemplates = await Template.findOne({ where: { userId } });
    if (!userTemplates) return null;

    const result: ITemplateItem[] = [];
    for (const tmp of userTemplates.templates) {
      if (tmp.isAutomatic) result.push(tmp);
    }

    return result;
  }

  public static async getGreetingTemplates(userId: number) {
    const userTemplates = await Template.findOne({ where: { userId } });
    if (!userTemplates) return null;

    const result: ITemplateItem[] = [];
    for (const tmp of userTemplates.templates) {
      if (tmp.isGreeting) result.push(tmp);
    }

    return result;
  }

  public static async getManualTemplates(userId: number) {
    const userTemplates = await Template.findOne({ where: { userId } });
    if (!userTemplates) return null;

    const result: ITemplateItem[] = [];
    for (const tmp of userTemplates.templates) {
      if (!tmp.isAutomatic) result.push(tmp);
    }

    return result;
  }

  public static async getMailTemplateWithIndex(userId: number) {
    const userTemplates = await Template.findOne({ where: { userId } });
    if (!userTemplates) return null;

    for (let i = 0; i < userTemplates.templates.length; i++) {
      if (userTemplates.templates[i].isSentForEmail)
        return { message: userTemplates.templates[i], index: i };
    }

    return null;
  }
}