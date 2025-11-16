import { z } from "zod";

export const orderItemSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
  price: z.number().min(0, "Price must be non-negative"),
});

export const createOrderSchema = z.object({
  customerId: z.string().min(1, "Customer ID is required"),
  items: z.array(orderItemSchema).min(1, "At least one item is required"),
});

export type CreateOrderRequest = z.infer<typeof createOrderSchema>;
export type OrderItem = z.infer<typeof orderItemSchema>;
