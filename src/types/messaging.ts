import { EVENT_TYPES } from "@/config/events";

export interface BaseEvent {
  eventId: string;
  eventType: string;
  timestamp: string;
}

export interface OrderCreatedEvent extends BaseEvent {
  eventType: typeof EVENT_TYPES.ORDER_CREATED;
  orderId: string;
  customerId: string;
  items: Array<{
    productId: string;
    quantity: number;
    price: number;
  }>;
  totalAmount: string;
  status: string;
  createdAt: Date;
}

export interface DeliveryStatusEvent extends BaseEvent {
  eventType:
    | typeof EVENT_TYPES.ORDER_SHIPPED
    | typeof EVENT_TYPES.ORDER_DELIVERED;
  orderId: string;
}

export interface DLQEvent extends BaseEvent {
  originalEvent: unknown;
  reason: string;
}

export type QueueEvent = OrderCreatedEvent | DeliveryStatusEvent | DLQEvent;

export interface QueueMessage {
  id: string;
  topic: string;
  payload: QueueEvent;
  timestamp: Date;
}
