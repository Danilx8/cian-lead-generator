import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "./database";

export enum UserStatus {
  active = "active",
  pending = "pending",
  blocked = "blocked"
}

export enum UserRole {
  user = "user",
  admin = "admin"
}

export enum AngebotOption {
  NONE = 1,
  NO_CANCEL_YES_WRITE = 2,
  YES_CANCEL_YES_WRITE = 3,
  NO_CANCEL_NO_WRITE = 4,
  YES_CANCEL_NO_WRITE = 5,
}

interface IUserAttributes {
  id: number;
  email: string;
  passwordHash: string;
  username: string;
  status: UserStatus;
  role: UserRole;
  sendWithAngebot: AngebotOption;
  visionFolderId?: string;
  avatarPath?: string;
  itemsChunkSize: number;
  itemsInterval?: number;
  newMessagesInterval?: number;
  chunksInterval?: number;
  repliesInterval?: number;
}

interface IUserCreationAttributes
  extends Optional<IUserAttributes, "id" | "status" | "role" | "visionFolderId" |
    "sendWithAngebot" | "itemsChunkSize"> {
}

class User
  extends Model<IUserAttributes, IUserCreationAttributes>
  implements IUserAttributes {
  declare id: number;
  declare email: string;
  declare passwordHash: string;
  declare username: string;
  declare status: UserStatus;
  declare role: UserRole;
  declare sendWithAngebot: AngebotOption;
  declare visionFolderId?: string;
  declare avatarPath?: string;
  declare itemsChunkSize: number;
  declare itemsInterval?: number;
  declare chunksInterval?: number;
  declare newMessagesInterval?: number;
  declare repliesInterval?: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: false
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM(...Object.values(UserStatus)),
      allowNull: false,
      defaultValue: UserStatus.active
    },
    role: {
      type: DataTypes.ENUM(...Object.values(UserRole)),
      allowNull: false,
      defaultValue: UserRole.user
    },
    sendWithAngebot: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: AngebotOption.NONE
    },
    visionFolderId: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null
    },
    avatarPath: {
      type: DataTypes.STRING,
      allowNull: true
    },
    itemsChunkSize: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3
    },
    itemsInterval: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    chunksInterval: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    newMessagesInterval: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    repliesInterval: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: "users",
    timestamps: true
  }
);

export default User;
