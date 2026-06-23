import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "./database";
import User from "./user.model";

export enum ProxyProtocol {
  HTTP = "http",
  HTTPS = "https",
  SOCKS4 = "socks4",
  SOCKS5 = "socks5"
}

export interface IProxyAttributes {
  id: number;
  userId: number;
  host: string;
  port: number;
  username?: string;
  password?: string;
  protocol: ProxyProtocol;
  maximumConnections?: number;
  country?: string;
  city?: string;
  countryCode?: string; // Добавлено поле кода страны
  realIp?: string; // Добавлено поле реального IP
  isRotating?: boolean;
  refreshUrl?: string;
  isInUse?: boolean;
}

interface IProxyCreationAttributes extends Optional<IProxyAttributes,
  "id" | "username" | "password" | "maximumConnections" | "country" | "city" | "countryCode" |
  "realIp" | "isRotating" | "refreshUrl" | "isInUse"> {
}

class Proxy
  extends Model<IProxyAttributes, IProxyCreationAttributes>
  implements IProxyAttributes {
  declare id: number;
  declare userId: number;
  declare host: string;
  declare port: number;
  declare username?: string;
  declare password?: string;
  declare protocol: ProxyProtocol;
  declare maximumConnections?: number;
  declare country?: string;
  declare city?: string;
  declare countryCode?: string;
  declare realIp?: string;
  declare isRotating?: boolean;
  declare refreshUrl?: string;
  declare isInUse?: boolean;

  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Proxy.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
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
    host: {
      type: DataTypes.STRING,
      allowNull: false
    },
    port: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    username: {
      type: DataTypes.STRING,
      allowNull: true
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true
    },
    protocol: {
      type: DataTypes.ENUM(...Object.values(ProxyProtocol)),
      allowNull: false,
      defaultValue: ProxyProtocol.HTTP
    },
    maximumConnections: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "maximum_connections"
    },
    country: {
      type: DataTypes.STRING,
      allowNull: true
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true
    },
    countryCode: {
      type: DataTypes.STRING(2),
      allowNull: true,
      field: "country_code"
    },
    realIp: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "real_ip"
    },
    isRotating: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "is_rotating"
    },
    refreshUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
      field: "refresh_url"
    },
    isInUse: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: "is_in_use"
    }
  },
  {
    sequelize,
    tableName: "proxies",
    timestamps: true,
    paranoid: true
  }
);

export default Proxy;