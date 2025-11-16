export const ORDER_STATUS = {
  PENDING_SHIPMENT: "Pending Shipment",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

export interface CreateOrderRequest {
  customerId: string;
  items: OrderItem[];
}

export interface CreateOrderResponse {
  orderId: string;
  status: string;
  customerId: string;
  items: OrderItem[];
  totalAmount: number;
  createdAt: string;
}

export enum OrderErrorCode {
  INSUFFICIENT_INVENTORY = "INSUFFICIENT_INVENTORY",
  INVENTORY_SERVICE_UNAVAILABLE = "INVENTORY_SERVICE_UNAVAILABLE",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  ORDER_NOT_FOUND = "ORDER_NOT_FOUND",
  INVALID_STATUS_TRANSITION = "INVALID_STATUS_TRANSITION",
  DUPLICATE_EVENT = "DUPLICATE_EVENT",
}

export interface UnavailableItem {
  productId: string;
  requested: number;
  available: number;
}

export interface OrderError {
  code: OrderErrorCode;
  message: string;
  details?: UnavailableItem[] | any;
}

export interface OrderCreationResult {
  success: boolean;
  order?: CreateOrderResponse;
  error?: OrderError;
}

export interface OrderUpdateResult {
  success: boolean;
  order?: any;
  error?: OrderError;
}
