import { sequelize } from "./database";
import { DataTypes, Model, Optional } from "sequelize";
import User from "./user.model";
import ProxyModel from "./proxy.model";

interface IAccountAttributes {
  id: number;
  name?: string;
  login: string;
  password: string;
  userId: number;
  proxyId?: number;
}

interface IAccountCreationAttributes extends Optional<IAccountAttributes, "id" | "name"> {}

class Account extends Model<IAccountAttributes, IAccountCreationAttributes> implements IAccountAttributes {
  declare id: number;
  declare name?: string;
  declare login: string;
  declare password: string;
  declare userId: number;
  declare proxyId?: number;
}

Account.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    login: {
      type: DataTypes.STRING,
      allowNull: false
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: "id"
      },
      field: "user_id"
    },
    proxyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: ProxyModel,
        key: "id"
      },
      onDelete: "SET NULL"
    }
  },
  {
    sequelize,
    tableName: "accounts",
    paranoid: true
  }
);

export default Account;
