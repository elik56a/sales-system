export interface InventoryCheckRequest {
  productId: string;
  quantity: number;
}

export interface InventoryCheckResponse {
  available: boolean;
  productId: string;
  availableQuantity?: number;
}
