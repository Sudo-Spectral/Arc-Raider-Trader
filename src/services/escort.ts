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
import type { EscortRecord } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..", "..");
const escortsPath = join(rootDir, "data", "escorts.json");

export const escortStore = new TaskStore<EscortRecord>(escortsPath);

export async function resolveEscortChannel(interaction: ChatInputCommandInteraction): Promise<TextChannel> {
  const channelId =
    process.env.ESCORT_CHANNEL_ID ?? process.env.TRADES_CHANNEL_ID ?? interaction.channelId;
  const channel = await interaction.client.channels.fetch(channelId);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error("Configured escort channel is missing or not a text channel.");
  }
  return channel as TextChannel;
}

export function buildEscortCompleteButton(escortId: string, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`escort:complete:${escortId}`)
      .setLabel(disabled ? "Escort complete" : "Mark escort complete")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled)
  );
}