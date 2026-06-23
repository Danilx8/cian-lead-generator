import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "./database";
import Merchant from "./merchant.model";
import Category from "./category.model";

export interface IItemAttributes {
  id: number;
  cianId: string;
  name: string;
  categoryId?: number;
  merchantId: number;
  price?: number;
  merchant?: Merchant;
}

export interface IItemCreationAttributes extends Optional<IItemAttributes, "id" | "price"> {
}

class Item extends Model<IItemAttributes, IItemCreationAttributes> implements IItemAttributes {
  declare id: number;
  declare cianId: string;
  declare name: string;
  declare categoryId?: number;
  declare merchantId: number;
  declare price?: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
  declare merchant?: Merchant;
}

Item.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  cianId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  price: {
    type: DataTypes.INTEGER,
  },
  categoryId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Category,
      key: "id"
    }
  },
  merchantId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Merchant,
      key: "id"
    },
    onDelete: "CASCADE",
  }
}, {
  sequelize, tableName: "items", timestamps: true
})

export default Item;
