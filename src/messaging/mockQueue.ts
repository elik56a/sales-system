import { logger } from "@/monitoring/logger";
import { Topic } from "@/config/events";
import { QueueEvent, QueueMessage } from "@/types/messaging";
import { generateMessageId } from "@/utils/idGenerator";

class MockQueue {
  private messages: QueueMessage[] = [];
  private subscribers: Map<string, ((message: QueueEvent) => void)[]> =
    new Map();

  async publish(topic: string, message: QueueEvent): Promise<void> {
    const queueMessage: QueueMessage = {
      id: generateMessageId(),
      topic,
      payload: message,
      timestamp: new Date(),
    };

    this.messages.push(queueMessage);

    logger.info("Message published to mock queue", {
      messageId: queueMessage.id,
      topic,
      payloadType: message.eventType || "unknown",
    });

    // Notify subscribers
    const topicSubscribers = this.subscribers.get(topic) || [];
    topicSubscribers.forEach((callback) => {
      try {
        callback(message);
      } catch (error) {
        logger.error("Error in mock queue subscriber", {
          topic,
          error: error instanceof Error ? error.message : error,
        });
      }
    });
  }

  subscribe(topic: Topic, callback: (message: QueueEvent) => void): void {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, []);
    }
    this.subscribers.get(topic)!.push(callback);

    logger.info("Subscribed to mock queue topic", { topic });
  }

  getMessages(topic?: string): QueueMessage[] {
    if (topic) {
      return this.messages.filter((msg) => msg.topic === topic);
    }
    return [...this.messages];
  }

  clear(): void {
    this.messages = [];
    logger.info("Mock queue cleared");
  }
}

// Global mock queue instance
export const mockQueue = new MockQueue();
