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
