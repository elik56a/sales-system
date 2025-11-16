export const EVENT_TYPES = {
  ORDER_CREATED: "order.created",
  ORDER_SHIPPED: "order.shipped",
  ORDER_DELIVERED: "order.delivered",
} as const;

export const TOPICS = {
  ORDER_EVENTS: "order-events",
  DELIVERY_EVENTS: "delivery-events",
  DEAD_LETTER_QUEUE: "dead-letter-queue",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
export type Topic = (typeof TOPICS)[keyof typeof TOPICS];
