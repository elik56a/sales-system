import { v4 as uuidv4 } from 'uuid';

export const generateEventId = (prefix?: string): string => {
  const uuid = uuidv4();
  return prefix ? `${prefix}-${uuid}` : uuid;
};

export const generateCorrelationId = (): string => {
  return `req-${uuidv4()}`;
};

export const generateMessageId = (): string => {
  return `msg-${uuidv4()}`;
};
