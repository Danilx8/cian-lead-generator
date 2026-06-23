import { NextFunction, Request, Response } from "express";
import { CategoryService } from "../services/category.service";

export const showCategories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await CategoryService.GetAllCategories();
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).send();
  }
};

export const getCategoryByCianId = async (req: Request, res: Response, next: NextFunction) => {
  const { cianId } = req.params;
  const category = await CategoryService.GetCategoryByCianId(Number(cianId));
  res.status(200).json(category);
};

export const getCategoryBySlug = async (req: Request, res: Response, next: NextFunction) => {
  const { slug } = req.params;
  const category = await CategoryService.GetCategoryBySlug(slug);
  res.status(200).json(category);

};
