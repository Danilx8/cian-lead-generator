import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "./database";
import Dialog from "./dialog.model";

export interface IMessageAttributes {
  id: number;
  isSentByUser: boolean;
  isRead: boolean;
  text: string;
  attachment?: string;
  dialogId: number;
}

export interface IMessageCreationAttributes
  extends Optional<IMessageAttributes, "id" | "text" | "attachment"> {
  createdAt?: Date;
  updatedAt?: Date;
}

class Message extends Model<IMessageAttributes, IMessageCreationAttributes> implements IMessageAttributes {
  declare id: number;
  declare isSentByUser: boolean;
  declare isRead: boolean;
  declare text: string;
  declare attachment?: string;
  declare dialogId: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Message.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  isSentByUser: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: ""
  },
  attachment: {
    type: DataTypes.STRING,
    allowNull: true
  },
  dialogId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Dialog,
      key: "id"
    }
  }
}, {
  sequelize,
  tableName: "messages",
  timestamps: true,
  paranoid: true,
  indexes: [
    {
      unique: true,
      fields: ["dialogId", "text"],
      where: {
        isSentByUser: false  // ✅ Индекс работает только для входящих сообщений
      }
    }
  ]
});

export default Message;