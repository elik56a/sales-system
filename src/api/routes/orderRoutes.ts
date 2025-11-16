import { Router } from "express";
import { createOrder } from "@/api/controllers/orderController";

const router: Router = Router();

// POST /api/orders - Create new order
router.post("/", createOrder);

export { router as orderRoutes };
