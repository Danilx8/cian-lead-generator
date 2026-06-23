import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "./database";

export enum MerchantType {
  PRIVATE = "PRIVATE",
  COMMERCIAL = "COMMERCIAL",
}

export interface IMerchantAttributes {
  id: number;
  name: string;
  cianId: string;
  type: MerchantType;
  activeSince?: string;
  profilePicture?: string;
}

export interface IMerchantCreationAttributes
  extends Optional<IMerchantAttributes, "id"> {
}

class Merchant extends Model<IMerchantAttributes, IMerchantCreationAttributes>
  implements IMerchantAttributes {
  declare id: number;
  declare name: string;
  declare activeSince: string;
  declare cianId: string;
  declare profilePicture?: string;
  declare type: MerchantType;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Merchant.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    activeSince: {
      type: DataTypes.STRING,
      allowNull: true
    },
    cianId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    profilePicture: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    type: {
      type: DataTypes.ENUM(...Object.values(MerchantType)),
      allowNull: false
    }
  },
  {
    sequelize,
    tableName: "merchants",
    timestamps: true,
    indexes: [
      { fields: ["cianId"], unique: true } // Explicit unique index
    ]
  }
);

export default Merchant;