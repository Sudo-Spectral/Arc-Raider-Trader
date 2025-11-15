import fs from "fs-extra";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  TextChannel,
} from "discord.js";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { RatingRecord, RatingSummary, TradeItemMatch, TradeRecord } from "../types.js";

const { ensureDir, readJSON, writeJSON } = fs;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..", "..");

class JsonStore<T> {
  constructor(private readonly filePath: string, private readonly defaultValue: T) {}

  private async ensureFile(): Promise<void> {
    await ensureDir(dirname(this.filePath));
  }

  async read(): Promise<T> {
    await this.ensureFile();
    try {
      return (await readJSON(this.filePath)) as T;
    } catch {
      return this.defaultValue;
    }
  }

  async write(data: T): Promise<void> {
    await this.ensureFile();
    await writeJSON(this.filePath, data, { spaces: 2 });
  }

  async update(mutator: (data: T) => void | Promise<void>): Promise<T> {
    const current = await this.read();
    await mutator(current);
    await this.write(current);
    return current;
  }
}

export class TradeStore {
  private store: JsonStore<TradeRecord[]>;

  constructor(dataDir = "data") {
    this.store = new JsonStore(join(rootDir, dataDir, "trades.json"), []);
  }

  async list(): Promise<TradeRecord[]> {
    return this.store.read();
  }

  async getById(id: string): Promise<TradeRecord | undefined> {
    const trades = await this.store.read();
    return trades.find((trade) => trade.id === id);
  }

  async getByThreadId(threadId: string): Promise<TradeRecord | undefined> {
    const trades = await this.store.read();
    return trades.find((trade) => trade.threadId === threadId);
  }

  async save(trade: TradeRecord): Promise<void> {
    await this.store.update((trades) => {
      trades.push(trade);
    });
  }

  async update(id: string, updater: (trade: TradeRecord) => void): Promise<TradeRecord | undefined> {
    let updated: TradeRecord | undefined;
    await this.store.update((trades) => {
      const index = trades.findIndex((trade) => trade.id === id);
      if (index !== -1) {
        updater(trades[index]);
        updated = trades[index];
      }
    });
    return updated;
  }
}

export class RatingStore {
  private store: JsonStore<RatingRecord[]>;

  constructor(dataDir = "data") {
    this.store = new JsonStore(join(rootDir, dataDir, "ratings.json"), []);
  }

  async list(): Promise<RatingRecord[]> {
    return this.store.read();
  }

  async findByTradeId(tradeId: string): Promise<RatingRecord | undefined> {
    const ratings = await this.store.read();
    return ratings.find((rating) => rating.tradeId === tradeId);
  }

  async add(rating: RatingRecord): Promise<void> {
    await this.store.update((ratings) => {
      ratings.push(rating);
    });
  }

  async summaryForSeller(sellerId: string): Promise<RatingSummary> {
    const ratings = await this.store.read();
    const sellerRatings = ratings.filter((rating) => rating.sellerId === sellerId);
    const totalPositive = sellerRatings.filter((r) => r.rating === 1).length;
    const totalNegative = sellerRatings.filter((r) => r.rating === -1).length;
    return {
      sellerId,
      totalPositive,
      totalNegative,
      score: totalPositive - totalNegative,
    };
  }
}

export const tradeStore = new TradeStore();
export const ratingStore = new RatingStore();

export async function resolveTradeChannel(interaction: ChatInputCommandInteraction): Promise<TextChannel> {
  const channelId = process.env.TRADES_CHANNEL_ID ?? interaction.channelId;
  const channel = await interaction.client.channels.fetch(channelId);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error("Configured trades channel is missing or not a text channel.");
  }
  return channel as TextChannel;
}

export async function findTradeForInteraction(
  interaction: ChatInputCommandInteraction,
  providedTradeId?: string
): Promise<TradeRecord | undefined> {
  if (providedTradeId) {
    const trade = await tradeStore.getById(providedTradeId);
    if (trade) {
      return trade;
    }
  }

  if (interaction.channel?.isThread()) {
    const trade = await tradeStore.getByThreadId(interaction.channelId);
    if (trade) {
      return trade;
    }
  }

  return undefined;
}

export function buildCompleteButton(tradeId: string, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`trade:complete:${tradeId}`)
      .setLabel(disabled ? "Trade ready for rating" : "Mark trade complete")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled)
  );
}

export function buildRatingButtons(tradeId: string, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`trade:rate:${tradeId}:positive`)
      .setLabel("Positive")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`trade:rate:${tradeId}:negative`)
      .setLabel("Negative")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

export function formatMatchedItems(matches: TradeItemMatch[]): string {
  if (!matches.length) {
    return "• No known item match, please double-check manually.";
  }

  return matches
    .map((match) => {
      if (match.match === "unknown") {
        if (match.suggestions?.length) {
          const suggestionText = match.suggestions.join(", ");
          return `• ${match.input} _(no confident match — maybe: ${suggestionText})_`;
        }
        return `• ${match.input} _(no confident match)_`;
      }

      return `• ${match.match} _(from “${match.input}”)_`;
    })
    .join("\n");
}
