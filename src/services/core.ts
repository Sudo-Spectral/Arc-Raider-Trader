import fs from "fs-extra";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  TextChannel,
} from "discord.js";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { RatingRecord, RatingSummary, RatingTargetRole, TradeItemMatch, TradeRecord } from "../types.js";

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

  async findByTradeAndRole(tradeId: string, targetRole: RatingTargetRole): Promise<RatingRecord | undefined> {
    const ratings = await this.store.read();
    return ratings.find((rating) => rating.tradeId === tradeId && rating.targetRole === targetRole);
  }

  async hasRating(tradeId: string, targetRole: RatingTargetRole): Promise<boolean> {
    return Boolean(await this.findByTradeAndRole(tradeId, targetRole));
  }

  async add(rating: RatingRecord): Promise<void> {
    await this.store.update((ratings) => {
      ratings.push(rating);
    });
  }

  async summaryForUser(userId: string): Promise<RatingSummary> {
    const ratings = await this.store.read();
    const userRatings = ratings.filter((rating) => rating.targetUserId === userId);
    const totalPositive = userRatings.filter((r) => r.rating === 1).length;
    const totalNegative = userRatings.filter((r) => r.rating === -1).length;
    return {
      userId,
      totalPositive,
      totalNegative,
      score: totalPositive - totalNegative,
    };
  }
}

export const tradeStore = new TradeStore();
export const ratingStore = new RatingStore();

export async function syncTradeRatingState(trade: TradeRecord) {
  const [sellerRated, buyerRated] = await Promise.all([
    ratingStore.hasRating(trade.id, "seller"),
    ratingStore.hasRating(trade.id, "buyer"),
  ]);
  const completed = sellerRated && buyerRated;
  await tradeStore.update(trade.id, (record) => {
    record.status = completed ? "completed" : "awaiting_rating";
  });
  trade.status = completed ? "completed" : "awaiting_rating";
  return { sellerRated, buyerRated, completed };
}

export async function lockTradeThread(client: Client, trade: TradeRecord, reason?: string) {
  const channel = await client.channels.fetch(trade.threadId).catch(() => null);
  if (!channel || !channel.isThread()) {
    return;
  }

  if (!channel.locked) {
    await channel.setLocked(true);
  }

  if (!channel.archived) {
    await channel.setArchived(true, reason ?? `Trade ${trade.id} fully reviewed.`);
  }
}

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

export function buildRatingButtons(
  tradeId: string,
  targetRole: RatingTargetRole,
  disabled = false
) {
  const labelPrefix = targetRole === "seller" ? "Buyer review" : "Seller review";
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`trade:rate:${tradeId}:${targetRole}:positive`)
      .setLabel(`${labelPrefix}: Positive`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`trade:rate:${tradeId}:${targetRole}:negative`)
      .setLabel(`${labelPrefix}: Negative`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

export function buildAllRatingComponents(
  tradeId: string,
  completion: Partial<Record<RatingTargetRole, boolean>> = {}
) {
  return [
    buildRatingButtons(tradeId, "seller", completion.seller ?? false),
    buildRatingButtons(tradeId, "buyer", completion.buyer ?? false),
  ];
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
