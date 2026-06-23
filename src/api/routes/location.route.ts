import express from "express";
import { getLocationByCianId, getLocationBySlug, showLocations } from "../controllers/location.controller";

const router = express.Router();

router.get('/', showLocations);
router.get('/cianId/:cianId', getLocationByCianId);
router.get('/slug/:slug', getLocationBySlug);

export default router;