// Express Request interface augmentation
// Centralizes all custom properties added to Express Request

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      user?: {
        id: string;
        role?: string;
      };
    }
  }
}

export {};
