import type { Client, MessageCreateOptions, TextChannel } from "discord.js";
import { ChannelType } from "discord.js";

let cachedChannel: TextChannel | null = null;
let cachedChannelId: string | null = null;

async function resolveLogChannel(client: Client): Promise<TextChannel | null> {
  const channelId = process.env.LOG_CHANNEL_ID;
  if (!channelId) {
    return null;
  }

  if (cachedChannel && cachedChannelId === channelId) {
    return cachedChannel;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      console.warn("[activityLog] Configured log channel is missing or not a text channel.");
      return null;
    }

    cachedChannel = channel as TextChannel;
    cachedChannelId = channelId;
    return cachedChannel;
  } catch (error) {
    console.warn(`[activityLog] Failed to fetch log channel ${channelId}`, error);
    return null;
  }
}

export async function logActivity(client: Client, payload: string | MessageCreateOptions): Promise<void> {
  const channel = await resolveLogChannel(client);
  if (!channel) {
    return;
  }

  const messageOptions: MessageCreateOptions = typeof payload === "string" ? { content: payload } : payload;
  try {
    await channel.send(messageOptions);
  } catch (error) {
    console.warn("[activityLog] Failed to send log message", error);
  }
}

export function formatLogMessage(lines: Array<string | false | undefined | null>): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}
