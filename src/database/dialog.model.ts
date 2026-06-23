import { DataTypes, Model, Op, Optional } from "sequelize";
import { sequelize } from "./database";
import User from "./user.model";
import Item from "./item.model";
import Worker from "./worker.model";

export interface IDialogAttributes {
  id: number;
  isActive: boolean;
  emailSent: boolean;
  isAutomatic: boolean;
  userId: number;
  itemId: number;
  workerId?: number;
  createdAt: Date;
  updatedAt: Date;
  item?: Item;
}

interface IDialogCreationAttributes extends Optional<IDialogAttributes, "id" | "isAutomatic" | "createdAt" | "updatedAt" | "emailSent" | "item"> {
}

class Dialog extends Model<IDialogAttributes, IDialogCreationAttributes> implements IDialogCreationAttributes {
  declare id: number;
  declare isActive: boolean;
  declare emailSent: boolean;
  declare isAutomatic: boolean;
  declare userId: number;
  declare itemId: number;
  declare workerId?: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
  declare item?: Item;
}

Dialog.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    emailSent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    isAutomatic: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: "id"
      }
    },
    itemId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Item,
        key: "id"
      }
    },
    workerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: Worker,
        key: "id"
      }
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false
    }
  }, {
    sequelize, tableName: "dialogs", timestamps: true, paranoid: true
  }
);

export async function deleteOlderDialogs() {
  await Dialog.destroy({
    where: {
      createdAt: { [Op.lte]: new Date(Date.now() - (60 * 60 * 2 * 1000 /* 2hrs in ms */)) },
      isActive: false
    }
  });
}

export default Dialog;