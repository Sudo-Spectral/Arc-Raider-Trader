import "dotenv/config";
import {
  ButtonInteraction,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  Interaction,
} from "discord.js";
import { nanoid } from "nanoid";
import { escortCommand, profileCommand, rateCommand, tradeCommand, tradeEditCommand } from "./commands/index.js";
import type { CommandDefinition } from "./commands/index.js";
import {
  buildAllRatingComponents,
  buildCompleteButton,
  lockTradeThread,
  ratingStore,
  syncTradeRatingState,
  tradeStore,
} from "./services/core.js";
import { buildEscortCompleteButton, escortStore } from "./services/escort.js";
import { formatLogMessage, logActivity } from "./services/activityLog.js";
import { repStore } from "./services/repStore.js";
import type { RatingRecord, RatingTargetRole, TradeRecord } from "./types.js";

const commands: CommandDefinition[] = [tradeCommand, tradeEditCommand, rateCommand, profileCommand, escortCommand];
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
  if (parts.length < 2) {
    return;
  }

  const [scope, action] = parts;
  if (scope === "trade") {
    if (action === "complete" && parts[2]) {
      await handleCompleteButton(interaction, parts[2]);
      return;
    }
    if (action === "rate") {
      const tradeId = parts[2];
      const targetRole = parts[3] as RatingTargetRole | undefined;
      const sentiment = parts[4];
      if (
        tradeId &&
        (targetRole === "seller" || targetRole === "buyer") &&
        (sentiment === "positive" || sentiment === "negative")
      ) {
        await handleRatingButton(interaction, tradeId, targetRole, sentiment);
      }
    }
    return;
  }

  if (scope === "escort" && action === "complete" && parts[2]) {
    await handleEscortCompleteButton(interaction, parts[2]);
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

  await logActivity(interaction.client, {
    content: formatLogMessage([
      "✅ **Trade marked complete**",
      `Trade ID: ${trade.id}`,
      `Actor: ${interaction.user} (${interaction.user.tag})`,
      `Thread: <#${trade.threadId}>`,
    ]),
  });

  const prompt = [
    `✅ ${interaction.user} marked this trade as complete.`,
    `<@${trade.buyerId}>, share how the seller did.`,
    `<@${trade.sellerId}>, let us know how the buyer performed.`,
  ].join("\n");

  const thread = await interaction.client.channels.fetch(trade.threadId).catch(() => null);
  if (thread && thread.isThread()) {
    await thread.send({
      content: prompt,
      components: buildAllRatingComponents(trade.id),
    });
  }
}

async function handleRatingButton(
  interaction: ButtonInteraction,
  tradeId: string,
  targetRole: RatingTargetRole,
  sentiment: "positive" | "negative"
) {
  const trade = await tradeStore.getById(tradeId);
  if (!trade) {
    await interaction.reply({ content: "This trade no longer exists.", ephemeral: true });
    return;
  }

  const expectedReviewerId = targetRole === "seller" ? trade.buyerId : trade.sellerId;
  if (interaction.user.id !== expectedReviewerId) {
    await interaction.reply({ content: "You're not allowed to submit this review.", ephemeral: true });
    return;
  }

  const existingRating = await ratingStore.findByTradeAndRole(trade.id, targetRole);
  if (existingRating) {
    await interaction.reply({ content: "That review has already been logged.", ephemeral: true });
    return;
  }

  const ratingValue = sentiment === "positive" ? 1 : -1;
  const rating: RatingRecord = {
    id: nanoid(10),
    tradeId: trade.id,
    targetRole,
    targetUserId: targetRole === "seller" ? trade.sellerId : trade.buyerId,
    reviewerUserId: interaction.user.id,
    rating: ratingValue,
    createdAt: new Date().toISOString(),
  };

  await ratingStore.add(rating);
  const ratingState = await syncTradeRatingState(trade);

  await interaction.update({
    components: buildAllRatingComponents(trade.id, {
      seller: ratingState.sellerRated,
      buyer: ratingState.buyerRated,
    }),
  });
  await interaction.followUp({ content: "Thanks! Your rating has been logged.", ephemeral: true });

  const summary = ratingValue === 1 ? "Positive" : "Negative";
  const reviewerLabel = targetRole === "seller" ? "buyer" : "seller";
  const thread = await interaction.client.channels.fetch(trade.threadId).catch(() => null);
  if (thread && thread.isThread()) {
    await thread.send({
      content: [
        `${summary} rating for the ${targetRole} <@${rating.targetUserId}> by the ${reviewerLabel} <@${interaction.user.id}>`,
        `Trade ID: **${trade.id}**`,
      ].join("\n"),
    });
  }

  await logActivity(interaction.client, {
    content: formatLogMessage([
      `${sentiment === "positive" ? "🟢" : "🔴"} **Trade review submitted (button)**`,
      `Trade ID: ${trade.id}`,
      `Target (${targetRole}): <@${rating.targetUserId}>`,
      `Reviewer: ${interaction.user} (${interaction.user.tag})`,
    ]),
  });

  if (ratingState.completed) {
    await lockTradeThread(interaction.client, trade);
  }
}

async function handleEscortCompleteButton(interaction: ButtonInteraction, escortId: string) {
  const escort = await escortStore.getById(escortId);
  if (!escort) {
    await interaction.reply({ content: "I can't find that escort mission anymore.", ephemeral: true });
    return;
  }

  if (![escort.escortId, escort.clientId].includes(interaction.user.id)) {
    await interaction.reply({ content: "Only the escort or client can close this mission.", ephemeral: true });
    return;
  }

  let alreadyCompleted = false;
  await escortStore.update(escort.id, (record) => {
    if (record.status === "completed") {
      alreadyCompleted = true;
      return;
    }
    record.status = "completed";
  });

  if (alreadyCompleted) {
    await interaction.reply({ content: "That escort mission is already marked complete.", ephemeral: true });
    return;
  }

  const now = new Date().toISOString();
  const reason = `Escort mission ${escort.id} completed`;
  await Promise.all([
    repStore.add({
      id: nanoid(10),
      userId: escort.escortId,
      amount: 1,
      source: { type: "escort", recordId: escort.id },
      reason,
      createdAt: now,
      createdBy: interaction.user.id,
    }),
    repStore.add({
      id: nanoid(10),
      userId: escort.clientId,
      amount: 1,
      source: { type: "escort", recordId: escort.id },
      reason,
      createdAt: now,
      createdBy: interaction.user.id,
    }),
  ]);

  await interaction.update({ components: [buildEscortCompleteButton(escort.id, true)] });
  await interaction.followUp({ content: "Escort complete — granted +1 rep to both escort and client.", ephemeral: true });

  const thread = await interaction.client.channels.fetch(escort.threadId).catch(() => null);
  if (thread && thread.isThread()) {
    await thread.send(
      [
        `✅ Escort mission completed by <@${escort.escortId}> for <@${escort.clientId}>`,
        `Mission ID: **${escort.id}**`,
        `Both parties earned +1 Union rep.`,
      ].join("\n")
    );
  }

  await logActivity(interaction.client, {
    content: formatLogMessage([
      "🏁 **Escort mission completed**",
      `Mission ID: ${escort.id}`,
      `Actor: ${interaction.user} (${interaction.user.tag})`,
      `Escort: <@${escort.escortId}>`,
      `Client: <@${escort.clientId}>`,
    ]),
  });
}

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("You're missing the token in the .env file.");
  process.exit(1);
}

client.login(token);
