import { Router } from "express";
import { orderRoutes } from "./orderRoutes";

const router: Router = Router();

// Mount route modules
router.use("/orders", orderRoutes);

export { router as apiRoutes };
