import Item from "../../database/item.model";
import type { ItemDto } from "./parsing/parsing.types";
import { CreationAttributes } from "sequelize";

export class ItemsService {
  public static async getById(id: number): Promise<Item | null> {
    return await Item.findByPk(id);
  }

  public static async getByCianId(id: string): Promise<Item | null> {
    return await Item.findOne({ where: { cianId: id } });
  }

  public static async convertToModel(item: ItemDto, categoryId: number, merchantId: number) {
    return Item.build({
      cianId: item.item_id,
      name: item.item_name,
      price: item.price,
      categoryId,
      merchantId,
    }).save();
  }

  public static async saveBatch(items: Item[]) {
    const itemsData = items.map(item => item.toJSON() as CreationAttributes<Item>);
    return await Item.bulkCreate(itemsData);
  }

  public static async getByName(name: string) {
    return await Item.findOne({
      where: { name },
      order: [["createdAt", "DESC"]],
    });
  }
}
