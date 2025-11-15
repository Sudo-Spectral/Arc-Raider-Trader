import "dotenv/config";
import {
  ButtonInteraction,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  Interaction,
  TextBasedChannel,
} from "discord.js";
import { nanoid } from "nanoid";
import { profileCommand, rateCommand, tradeCommand, tradeEditCommand } from "./commands/index.js";
import type { CommandDefinition } from "./commands/index.js";
import { buildCompleteButton, buildRatingButtons, ratingStore, tradeStore } from "./services/core.js";
import type { RatingRecord } from "./types.js";

const commands: CommandDefinition[] = [tradeCommand, tradeEditCommand, rateCommand, profileCommand];
const commandCollection = new Collection<string, CommandDefinition>();
for (const command of commands) {
  commandCollection.set(command.data.name, command);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in successfully: ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = commandCollection.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Command ${interaction.commandName} failed`, error);
      const message = "Something went wrong, Please report this to a Union Clerk.";
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: message, ephemeral: true });
      } else {
        await interaction.reply({ content: message, ephemeral: true });
      }
    }
    return;
  }

  if (interaction.isButton()) {
    await handleButtonInteraction(interaction);
  }
});

async function handleButtonInteraction(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  if (parts.length < 3 || parts[0] !== "trade") {
    return;
  }

  if (parts[1] === "complete") {
    await handleCompleteButton(interaction, parts[2]);
    return;
  }

  if (parts[1] === "rate") {
    const tradeId = parts[2];
    const sentiment = parts[3];
    if (sentiment === "positive" || sentiment === "negative") {
      await handleRatingButton(interaction, tradeId, sentiment);
    }
  }
}

async function handleCompleteButton(interaction: ButtonInteraction, tradeId: string) {
  const trade = await tradeStore.getById(tradeId);
  if (!trade) {
    await interaction.reply({ content: "I can't find that trade anymore.", ephemeral: true });
    return;
  }

  if (![trade.sellerId, trade.buyerId].includes(interaction.user.id)) {
    await interaction.reply({ content: "Only the seller or buyer can mark this trade complete.", ephemeral: true });
    return;
  }

  await tradeStore.update(trade.id, (record) => {
    record.status = "awaiting_rating";
  });

  await interaction.update({ components: [buildCompleteButton(trade.id, true)] });
  await interaction.followUp({ content: "Marked this trade as ready for rating.", ephemeral: true });

  const prompt = [
    `✅ ${interaction.user} marked this trade as complete.`,
    `<@${trade.buyerId}>, please rate <@${trade.sellerId}> when you're ready:`,
  ].join("\n");

  const thread = await interaction.client.channels.fetch(trade.threadId).catch(() => null);
  if (thread && thread.isThread()) {
    await thread.send({
      content: prompt,
      components: [buildRatingButtons(trade.id)],
    });
  }
}

async function handleRatingButton(
  interaction: ButtonInteraction,
  tradeId: string,
  sentiment: "positive" | "negative"
) {
  const trade = await tradeStore.getById(tradeId);
  if (!trade) {
    await interaction.reply({ content: "This trade no longer exists.", ephemeral: true });
    return;
  }

  if (interaction.user.id !== trade.buyerId) {
    await interaction.reply({ content: "Only the recorded buyer can leave this rating.", ephemeral: true });
    return;
  }

  const existingRating = await ratingStore.findByTradeId(trade.id);
  if (existingRating) {
    await interaction.reply({ content: "This trade already has a rating.", ephemeral: true });
    return;
  }

  const ratingValue = sentiment === "positive" ? 1 : -1;
  const rating: RatingRecord = {
    id: nanoid(10),
    tradeId: trade.id,
    sellerId: trade.sellerId,
    buyerId: trade.buyerId,
    rating: ratingValue,
    createdAt: new Date().toISOString(),
  };

  await ratingStore.add(rating);
  await tradeStore.update(trade.id, (record) => {
    record.status = "completed";
  });

  await interaction.update({ components: [buildRatingButtons(trade.id, true)] });
  await interaction.followUp({ content: "Thanks! Your rating has been logged.", ephemeral: true });

  const summary = ratingValue === 1 ? "Positive" : "Negative";
  const thread = await interaction.client.channels.fetch(trade.threadId).catch(() => null);
  if (thread && thread.isThread()) {
    await thread.send({
      content: [
        `${summary} rating recorded for <@${trade.sellerId}> by <@${trade.buyerId}>`,
        `Trade ID: **${trade.id}**`,
      ].join("\n"),
    });
  }
}

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("You're missing the token in the .env file.");
  process.exit(1);
}

client.login(token);
