import "reflect-metadata";
import {
  ArrayUnique, IsArray, IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString, IsUrl,
  ValidateNested
} from "class-validator";
import { Type } from "class-transformer";

export enum BrowserOptions {
  MoreLogin = 1,
  Vision = 2,
  AdsPower = 3,
  Dolphin = 4,
  GoLogin = 5,
  OctoBrowser = 6,
  HideMyAccService = 7,
  LinkenSphere = 8,
  Indigo = 9,
  Identory = 10,
  Undetectable = 11
}

export enum BrowserPlatform {
  windows = 1,
  macos = 2,
  android = 3,
  ios = 4,
  linux = 5,
}

export enum BrowserCoreTypes {
  Chrome = 1,
  Firefox = 2,
}

export class FilterOptions {
  @IsInt()
  @IsOptional()
  id?: number;

  @IsString()
  @IsOptional()
  name?: string;

  @IsNotEmpty()
  @IsString()
  declare parsingLink: string; // may contain multiple URLs separated by commas

  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  @IsOptional()
  whiteList?: string[];

  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  @IsOptional()
  blackList?: string[];

  @IsInt()
  @IsOptional()
  views?: number;

  @IsInt()
  @IsOptional()
  adsLimit?: number;

  @IsDate({ message: "Format is YYYY-mm-dd or mm-dd-YYYY" })
  @IsOptional()
  @Type(() => Date)
  minDateRegistered?: Date;

  @IsDate({ message: "Format is YYYY-mm-dd or mm-dd-YYYY" })
  @IsOptional()
  @Type(() => Date)
  maxDateRegistered?: Date;

  @IsBoolean()
  @IsOptional()
  includeOldMerchants?: boolean;

  @IsBoolean()
  @IsOptional()
  includeSicherMerchants?: boolean;
}

export class ProfileOptions {
  @IsNotEmpty()
  @IsEnum(BrowserOptions, { message: "Invalid spoofing browser option" })
  declare browserOption: BrowserOptions;

  @IsEnum(BrowserPlatform, { message: "Invalid browser platform" })
  @IsOptional()
  operatorSystemId?: BrowserPlatform;

  @IsOptional()
  @IsEnum(BrowserCoreTypes, { message: "Invalid browser type" })
  browserCore?: BrowserCoreTypes;

  @IsOptional()
  userAgent?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => FilterOptions)
  filterOptions?: FilterOptions;

  @IsOptional()
  @IsBoolean()
  usesBrowser?: boolean;

  /** ID воркера — передаётся при создании профиля из WorkerService для имени профиля */
  @IsInt()
  @IsOptional()
  workerId?: number;
}