import { JsonStore } from "./jsonStore.js";
import { BaseTaskRecord } from "../types.js";

export class TaskStore<T extends BaseTaskRecord> {
  private readonly store: JsonStore<T[]>;

  constructor(filePath: string, defaultValue: T[] = []) {
    this.store = new JsonStore<T[]>(filePath, defaultValue);
  }

  async list(): Promise<T[]> {
    return this.store.read();
  }

  async getById(id: string): Promise<T | undefined> {
    const entries = await this.store.read();
    return entries.find((entry) => entry.id === id);
  }

  async getByThreadId(threadId: string): Promise<T | undefined> {
    const entries = await this.store.read();
    return entries.find((entry) => entry.threadId === threadId);
  }

  async getByInteractionId(interactionId: string): Promise<T | undefined> {
    const entries = await this.store.read();
    return entries.find((entry) => entry.interactionId === interactionId);
  }

  async save(record: T): Promise<void> {
    await this.store.update((entries) => {
      entries.push(record);
    });
  }

  async update(id: string, updater: (record: T) => void): Promise<T | undefined> {
    let updated: T | undefined;
    await this.store.update((entries) => {
      const index = entries.findIndex((entry) => entry.id === id);
      if (index !== -1) {
        updater(entries[index]);
        updated = entries[index];
      }
    });
    return updated;
  }
}
