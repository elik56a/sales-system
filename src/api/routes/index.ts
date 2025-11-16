import { Router } from "express";
import { orderRoutes } from "./orderRoutes";
import { getMetrics } from "@/api/controllers/metricsController";

const router: Router = Router();

// Mount route modules
router.use("/orders", orderRoutes);

// System metrics endpoint (requires auth)
router.get("/metrics", getMetrics);

export { router as apiRoutes };
