import { NextFunction, Response } from "express";
import { ApiError } from "../errors/api.error";
import { plainToInstance } from "class-transformer";
import { FilterOptions } from "../services/browsers/types";
import { validate } from "class-validator";
import { FilterService } from "../services/filters/filter.service";
import LinkInterpreterService from "../services/filters/linkInterpreter.service";
import { UrlFilters } from "../services/filters/types";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";

function splitLinks(input: string): string[] {
  return input
    .split(",")
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .filter((v, i, a) => a.indexOf(v) === i);
}

function validateCianUrls(urls: string[]): boolean {
  try {
    return urls.every(u => {
      const parsed = new URL(u);
      return parsed.host === "www.cian.ru" && !!parsed.protocol && (parsed.protocol === "http:" || parsed.protocol === "https:");
    });
  } catch {
    return false;
  }
}

export const createFilter = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const { filterOptions } = req.body;
  const userId = req.userId;

  const filterDto = plainToInstance(FilterOptions, filterOptions);
  const errors = await validate(filterDto);

  if (errors.length > 0) {
    return next(new ApiError(400, errors.toString()));
  }

  if (!filterDto.parsingLink || typeof filterDto.parsingLink !== "string") {
    return next(new ApiError(400, "parsingLink is required"));
  }
  const links = splitLinks(filterDto.parsingLink);
  if (links.length === 0 || !validateCianUrls(links)) {
    return next(new ApiError(400, "parsingLink must contain valid www.cian.ru URL(s) separated by commas"));
  }

  res.status(200).send(await FilterService.saveFilters(filterDto, userId!));
};

export const generateFilterUrl = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const { urlFilterOptions } = req.body;
  if (urlFilterOptions === undefined) return next(new ApiError(400, "urlFilterOptions is required"));

  const urlFilter = plainToInstance(UrlFilters, urlFilterOptions);
  const errors = await validate(urlFilter);

  if (errors.length > 0) {
    return next(new ApiError(400, errors.toString()));
  }

  res.status(200).send(await LinkInterpreterService.buildUrl(urlFilter));
};

export const getUsersFilters = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  res.status(200).send(await FilterService.getUsersFilters(req.userId!));
};

export const updateFilter = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const id = Number(req.params.id);
  const { updateData } = req.body;

  if (updateData && typeof updateData.parsingLink === "string") {
    const links = splitLinks(updateData.parsingLink);
    if (links.length === 0 || !validateCianUrls(links)) {
      return next(new ApiError(400, "parsingLink must contain valid www.cian.ru URL(s) separated by commas"));
    }
  }

  res.status(200).send(await FilterService.updateFilter(id, updateData, req.userId));
};

export const deleteFilter = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const id = Number(req.params.id);
  await FilterService.deleteFilter(id);
  res.status(200).json("success");
};
