import express from "express";
import { getCategoryByCianId, getCategoryBySlug, showCategories } from "../controllers/category.controller";

const router = express.Router();

router.get('/', showCategories);
router.get('/cianId/:cianId', getCategoryByCianId);
router.get('/slug/:slug', getCategoryBySlug);

export default router;