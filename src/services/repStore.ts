import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { JsonStore } from "./jsonStore.js";
import { RepEntry, RepSummary, RepSourceType } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..", "..");
const repPath = join(rootDir, "data", "rep.json");

export class RepStore {
  private readonly store = new JsonStore<RepEntry[]>(repPath, []);

  async add(entry: RepEntry): Promise<void> {
    await this.store.update((entries) => {
      entries.push(entry);
    });
  }

  async listByUser(userId: string): Promise<RepEntry[]> {
    const entries = await this.store.read();
    return entries.filter((entry) => entry.userId === userId);
  }

  async summaryForUser(userId: string): Promise<RepSummary> {
    const entries = await this.listByUser(userId);
    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
    const breakdown: Partial<Record<RepSourceType, number>> = {};
    let positiveRatings = 0;
    let negativeRatings = 0;

    for (const entry of entries) {
      breakdown[entry.source.type] = (breakdown[entry.source.type] ?? 0) + entry.amount;
      if (entry.source.type === "trade_rating") {
        if (entry.amount > 0) positiveRatings += 1;
        if (entry.amount < 0) negativeRatings += 1;
      }
    }

    return {
      userId,
      total,
      positiveRatings,
      negativeRatings,
      entries: entries.length,
      breakdown,
    };
  }
}

export const repStore = new RepStore();
