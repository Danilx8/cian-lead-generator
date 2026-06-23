import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "./database";
import User from "./user.model";

export interface ITemplateItem {
  title: string;
  texts: string[];
  isGreeting: boolean;
  isSentWithQr: boolean;
  isAutomatic: boolean;
  isSentImmediately: boolean;
  isSentForEmail: boolean;
  isSentForPayPal: boolean;
}

export interface ITemplateAttributes {
  id: number;
  userId: number;
  templates?: ITemplateItem[];
}

export interface ITemplateCreationAttributes
  extends Optional<ITemplateAttributes, "id" | "templates"> {
}

class Template extends Model<ITemplateAttributes, ITemplateCreationAttributes>
  implements ITemplateAttributes {
  declare id: number;
  declare userId: number;
  declare templates: ITemplateItem[];
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  // Метод для добавления нового шаблона
  async addTemplate(templateItem: ITemplateItem): Promise<void> {
    const existingTemplates = Array.isArray(this.templates) ? this.templates : [];

    // Проверяем на дубликаты по title
    const isDuplicate = existingTemplates.some(
      template => template.title.toLowerCase() === templateItem.title.toLowerCase()
    );

    if (isDuplicate) {
      throw new Error(`Template with title "${templateItem.title}" already exists`);
    }

    const updatedTemplates = [...existingTemplates, templateItem];
    await this.update({ templates: updatedTemplates });
  }

  // Метод для удаления шаблона по индексу
  async removeTemplate(index: number): Promise<void> {
    const existingTemplates = this.templates || [];

    if (index < 0 || index >= existingTemplates.length) {
      throw new Error("Invalid template index");
    }

    const updatedTemplates = existingTemplates.filter((_, i) => i !== index);
    await this.update({ templates: updatedTemplates });
  }

  // Метод для обновления шаблона по индексу
  async updateTemplate(index: number, templateItem: ITemplateItem): Promise<void> {
    const existingTemplates = this.templates || [];

    if (index < 0 || index >= existingTemplates.length) {
      throw new Error("Invalid template index");
    }

    // Проверяем на дубликаты (исключая текущий шаблон)
    const isDuplicate = existingTemplates.some(
      (template, i) => i !== index && template.title.toLowerCase() === templateItem.title.toLowerCase()
    );

    if (isDuplicate) {
      throw new Error(`Template with title "${templateItem.title}" already exists`);
    }

    const updatedTemplates = [...existingTemplates];
    updatedTemplates[index] = templateItem;
    await this.update({ templates: updatedTemplates });
  }

  // Метод для изменения порядка шаблонов
  async reorderTemplates(fromIndex: number, toIndex: number): Promise<void> {
    const existingTemplates = this.templates || [];

    if (fromIndex < 0 || fromIndex >= existingTemplates.length ||
        toIndex < 0 || toIndex >= existingTemplates.length) {
      throw new Error("Invalid template index");
    }

    const updatedTemplates = [...existingTemplates];
    const [movedTemplate] = updatedTemplates.splice(fromIndex, 1);
    updatedTemplates.splice(toIndex, 0, movedTemplate);

    await this.update({ templates: updatedTemplates });
  }

  // Метод для получения шаблона по индексу
  getTemplate(index: number): ITemplateItem | null {
    const existingTemplates = this.templates || [];

    if (index < 0 || index >= existingTemplates.length) {
      return null;
    }

    return existingTemplates[index];
  }

  // Метод для получения количества шаблонов
  getTemplatesCount(): number {
    return (this.templates || []).length;
  }
}

Template.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    userId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      unique: true,
      references: {
        model: User,
        key: "id"
      }
    },
    templates: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      validate: {
        isValidTemplatesArray(value: any) {
          if (!Array.isArray(value)) {
            throw new Error("Templates must be an array");
          }

          for (const template of value) {
            if (!template.title || !template.texts) {
              throw new Error("Each template must have title and text");
            }

            if (typeof template.title !== 'string' || !Array.isArray(template.texts) || !template.texts.every((item: any) => typeof item === "string")) {
              throw new Error("Template title and text must be strings");
            }
          }

          // Проверяем на дубликаты
          const titles = value.map((t: ITemplateItem) => t.title.toLowerCase());
          const uniqueTitles = new Set(titles);
          if (titles.length !== uniqueTitles.size) {
            throw new Error("Templates must have unique titles");
          }
        }
      }
    }
  },
  {
    sequelize,
    tableName: "templates",
    timestamps: true,
  }
);

export default Template;