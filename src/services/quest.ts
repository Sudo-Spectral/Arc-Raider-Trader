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
import { TaskStore } from "./taskStore.js";
import type { QuestRecord } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..", "..");
const questsPath = join(rootDir, "data", "quests.json");

export const questStore = new TaskStore<QuestRecord>(questsPath);

export async function resolveQuestChannel(interaction: ChatInputCommandInteraction): Promise<TextChannel> {
  const channelId =
    process.env.QUEST_CHANNEL_ID ?? process.env.TRADES_CHANNEL_ID ?? interaction.channelId;
  const channel = await interaction.client.channels.fetch(channelId);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error("Configured quest channel is missing or not a text channel.");
  }
  return channel as TextChannel;
}

export function buildQuestCompleteButton(questId: string, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`quest:complete:${questId}`)
      .setLabel(disabled ? "Quest completed" : "Mark quest complete")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled)
  );
}
