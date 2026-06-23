import "reflect-metadata";
import { IsArray, IsBoolean, IsEnum, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import {
  BuildingType,
  DealType,
  MarketType,
  PropertyType,
  RenovationType,
  SellerType
} from "../../../database/filter.model";

export class UrlFilters {
  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsNumber()
  locationId?: number;

  @IsOptional()
  @IsEnum(DealType)
  dealType?: DealType;

  @IsOptional()
  @IsEnum(PropertyType)
  propertyType?: PropertyType;

  @IsOptional()
  @IsEnum(MarketType)
  marketType?: MarketType;

  @IsOptional()
  @IsArray()
  rooms?: number[];

  @IsOptional()
  @IsNumber()
  priceMin?: number;

  @IsOptional()
  @IsNumber()
  priceMax?: number;

  @IsOptional()
  @IsNumber()
  areaMin?: number;

  @IsOptional()
  @IsNumber()
  areaMax?: number;

  @IsOptional()
  @IsNumber()
  kitchenAreaMin?: number;

  @IsOptional()
  @IsNumber()
  floorMin?: number;

  @IsOptional()
  @IsNumber()
  floorMax?: number;

  @IsOptional()
  @IsNumber()
  floorsInBuildingMin?: number;

  @IsOptional()
  @IsNumber()
  floorsInBuildingMax?: number;

  @IsOptional()
  @IsEnum(BuildingType)
  buildingType?: BuildingType;

  @IsOptional()
  @IsEnum(RenovationType)
  renovationType?: RenovationType;

  @IsOptional()
  @IsEnum(SellerType)
  sellerType?: SellerType;

  @IsOptional()
  @IsBoolean()
  notFirstFloor?: boolean;

  @IsOptional()
  @IsBoolean()
  notLastFloor?: boolean;

  @IsOptional()
  @IsBoolean()
  withPhotos?: boolean;

  @IsOptional()
  @IsBoolean()
  hasMortgage?: boolean;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => Object)
  customFilters?: Record<string, string>;
}
