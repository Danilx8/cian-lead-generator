import { NextFunction, Request, Response } from "express";
import { LocationService } from "../services/location.service";

export const showLocations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await LocationService.GetAllCategories();
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).send();
  }
};

export const getLocationByCianId = async (req: Request, res: Response, next: NextFunction) => {
  const { cianId } = req.params;
  const location = await LocationService.GetLocationByCianId(Number(cianId));
  res.status(200).json(location);
};

export const getLocationBySlug = async (req: Request, res: Response, next: NextFunction) => {
  const { slug } = req.params;
  const location = await LocationService.GetLocationBySlug(slug);
  res.status(200).json(location);
};