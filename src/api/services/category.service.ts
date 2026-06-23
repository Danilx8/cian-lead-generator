import Category from "../../database/category.model";
import { sequelize } from "../../database/database";

export class CategoryService {
  public static async GetAllCategories() {
    return await Category.findAll({
      order: [
        [sequelize.literal(`name = 'All'`), "DESC"],           // All идет первым
        [sequelize.literal("\"parentId\" IS NULL"), "DESC"],     // затем NULL parentId
        ["name", "ASC"]                                         // затем по алфавиту
      ]
    });
  }

  public static async GetCategoryById(id: number) {
    return Category.findByPk(id);
  }

  public static async GetCategoryByCianId(id: number) {
    return Category.findOne({
      where: { cianId: id }
    });
  }

  public static async GetCategoryBySlug(slug: string) {
    return Category.findOne({
      where: { slug: slug }
    });
  }
}