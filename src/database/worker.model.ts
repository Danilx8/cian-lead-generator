import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "./database";
import User from "./user.model";
import { BrowserCoreTypes, BrowserOptions, BrowserPlatform } from "../api/services/browsers/types";
import Proxy from "./proxy.model";
import Account from "./account.model";
import Filter from "./filter.model";

export enum WorkerState {
  // хорошие статусы
  INITIALIZING = "INITIALIZING",
  CONNECTING = "CONNECTING",
  AUTHENTICATING = "AUTHENTICATING",
  ACTIVE = "ACTIVE",
  RECONNECTING = "RECONNECTING",
  PHONE_VERIFICATION = "PHONE_VERIFICATION",
  EXPECTING_CODE = "EXPECTING_CODE",
  // плохие статусы
  ERROR = "ERROR",
  SHUTDOWN = "SHUTDOWN",
  BANNED = "BANNED",
  CONNECTION_LOST = "CONNECTION_LOST",
}

export interface IWorkerAttributes {
  id: number,
  status?: WorkerState;
  isActive?: boolean;
  port?: number;
  browserType: BrowserOptions;
  browserCore?: BrowserCoreTypes;
  operationSystem?: BrowserPlatform;
  currentBatchSize: number;
  batchStartTime?: string;
  isBatchActive: boolean;
  lastResetTime?: string;
  userAgent?: string;
  profileId?: string;
  userId: number;
  proxyId?: number;
  accountId?: number;
  filterId?: number;
  usesBrowser?: boolean;
  /** Полный номер в международном формате (с кодом страны), необязательно */
  phoneNumber?: string | null;
}

export interface IWorkerCreationAttributes extends Optional<IWorkerAttributes,
  "id" | "isActive" | "status" | "port" | "profileId" | "currentBatchSize" | "isBatchActive" | "userAgent" | "phoneNumber"> {
}

class Worker extends Model<IWorkerAttributes, IWorkerCreationAttributes> implements IWorkerAttributes {
  declare id: number;
  declare isActive?: boolean;
  declare status?: WorkerState;
  declare port?: number;
  declare browserType: BrowserOptions;
  declare browserCore?: BrowserCoreTypes;
  declare operationSystem?: BrowserPlatform;
  declare currentBatchSize: number;
  declare batchStartTime?: string;
  declare isBatchActive: boolean;
  declare lastResetTime?: string;
  declare userAgent?: string;
  declare profileId?: string;
  declare userId: number;
  declare proxyId?: number;
  declare accountId?: number;
  declare filterId?: number;
  declare usesBrowser?: boolean;
  declare phoneNumber?: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Worker.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    status: {
      type: DataTypes.ENUM(...Object.values(WorkerState)),
      allowNull: false,
      defaultValue: WorkerState.SHUTDOWN
    },
    port: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    browserType: {
      type: DataTypes.ENUM(...Object.keys(BrowserOptions)),
      allowNull: true,
      defaultValue: null
    },
    browserCore: {
      type: DataTypes.ENUM(...Object.keys(BrowserCoreTypes)),
      allowNull: true,
      defaultValue: null
    },
    operationSystem: {
      type: DataTypes.ENUM(...Object.keys(BrowserPlatform)),
      allowNull: true,
      defaultValue: null
    },
    currentBatchSize: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    batchStartTime: {
      type: DataTypes.DATE,
      allowNull: true
    },
    isBatchActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    lastResetTime: {
      type: DataTypes.DATE,
      allowNull: true
    },
    userAgent: {
      type: DataTypes.STRING,
      allowNull: true
    },
    profileId: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: "id"
      }
    },
    proxyId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: Proxy,
        key: "id"
      }
    },
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: Account,
        key: "id"
      }
    },
    filterId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: Filter,
        key: "id"
      },
      onUpdate: "SET NULL"
    },
    usesBrowser: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    phoneNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null
    }
  },
  { sequelize, tableName: "workers", timestamps: true, paranoid: true }
);

export default Worker;