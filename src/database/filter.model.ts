import { DataTypes, Model, Optional } from "sequelize";
import { sequelize } from "./database";
import User from "./user.model";
import Category from "./category.model";

export enum DealType {
  BUY = "buy",
  RENT_LONG = "rent_long",
  RENT_DAILY = "rent_daily",
}

export enum PropertyType {
  APARTMENT = "apartment",
  ROOM = "room",
  HOUSE = "house",
  LAND = "land",
  COMMERCIAL = "commercial",
  GARAGE = "garage",
}

export enum MarketType {
  SECONDARY = "secondary",
  NEW_BUILD = "new_build",
  ANY = "any",
}

export enum BuildingType {
  BRICK = "brick",
  PANEL = "panel",
  MONOLITH = "monolith",
  BLOCK = "block",
  WOOD = "wood",
  ANY = "any",
}

export enum RenovationType {
  DESIGNER = "designer",
  EURO = "euro",
  COSMETIC = "cosmetic",
  NEEDS_RENOVATION = "needs_renovation",
  ANY = "any",
}

export enum SellerType {
  OWNER = "owner",
  AGENT = "agent",
  DEVELOPER = "developer",
  ANY = "any",
}

export interface IFilterAttributes {
  id: number;
  name: string;
  isActive: boolean;

  searchLink: string;

  // Cian real estate filters
  dealType?: DealType;
  propertyType?: PropertyType;
  marketType?: MarketType;
  location?: string;
  locationId?: number;
  rooms?: number[];
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  areaMax?: number;
  kitchenAreaMin?: number;
  floorMin?: number;
  floorMax?: number;
  floorsInBuildingMin?: number;
  floorsInBuildingMax?: number;
  buildingType?: BuildingType;
  renovationType?: RenovationType;
  sellerType?: SellerType;
  notFirstFloor?: boolean;
  notLastFloor?: boolean;
  withPhotos?: boolean;
  hasMortgage?: boolean;

  // item/seller filters
  whiteList?: string[];
  blackList?: string[];
  adsLimit?: number;
  minDateRegistered?: string;
  maxDateRegistered?: string;

  userId: number;
  categoryId?: number;
}

interface IFilterCreationAttributes
  extends Optional<IFilterAttributes,
    "id" | "whiteList" | "blackList" | "maxDateRegistered" | "isActive"> {
}

class Filter extends Model<IFilterAttributes, IFilterCreationAttributes> implements IFilterCreationAttributes {
  declare id: number;
  declare name: string;
  declare isActive: boolean;
  declare searchLink: string;
  declare dealType?: DealType;
  declare propertyType?: PropertyType;
  declare marketType?: MarketType;
  declare location?: string;
  declare locationId?: number;
  declare rooms?: number[];
  declare priceMin?: number;
  declare priceMax?: number;
  declare areaMin?: number;
  declare areaMax?: number;
  declare kitchenAreaMin?: number;
  declare floorMin?: number;
  declare floorMax?: number;
  declare floorsInBuildingMin?: number;
  declare floorsInBuildingMax?: number;
  declare buildingType?: BuildingType;
  declare renovationType?: RenovationType;
  declare sellerType?: SellerType;
  declare notFirstFloor?: boolean;
  declare notLastFloor?: boolean;
  declare withPhotos?: boolean;
  declare hasMortgage?: boolean;
  declare whiteList?: string[];
  declare blackList?: string[];
  declare adsLimit?: number;
  declare minDateRegistered?: string;
  declare maxDateRegistered?: string;
  declare userId: number;
  declare categoryId?: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Filter.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    searchLink: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    dealType: {
      type: DataTypes.ENUM(...Object.values(DealType)),
      allowNull: true
    },
    propertyType: {
      type: DataTypes.ENUM(...Object.values(PropertyType)),
      allowNull: true
    },
    marketType: {
      type: DataTypes.ENUM(...Object.values(MarketType)),
      allowNull: true
    },
    location: {
      type: DataTypes.STRING,
      allowNull: true
    },
    locationId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    rooms: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      allowNull: true
    },
    priceMin: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    priceMax: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    areaMin: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    areaMax: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    kitchenAreaMin: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    floorMin: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    floorMax: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    floorsInBuildingMin: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    floorsInBuildingMax: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    buildingType: {
      type: DataTypes.ENUM(...Object.values(BuildingType)),
      allowNull: true
    },
    renovationType: {
      type: DataTypes.ENUM(...Object.values(RenovationType)),
      allowNull: true
    },
    sellerType: {
      type: DataTypes.ENUM(...Object.values(SellerType)),
      allowNull: true
    },
    notFirstFloor: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    },
    notLastFloor: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    },
    withPhotos: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    },
    hasMortgage: {
      type: DataTypes.BOOLEAN,
      allowNull: true
    },
    whiteList: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true
    },
    blackList: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true
    },
    adsLimit: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    minDateRegistered: {
      type: DataTypes.STRING,
      allowNull: true
    },
    maxDateRegistered: {
      type: DataTypes.STRING,
      allowNull: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: "id"
      }
    },
    categoryId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: Category,
        key: "id"
      }
    }
  }, {
    sequelize,
    tableName: "filters",
    timestamps: true
  }
);

export default Filter;
