import {
	ChannelType,
	ChatInputCommandInteraction,
	PermissionFlagsBits,
	SlashCommandBuilder,
	SlashCommandOptionsOnlyBuilder,
	SlashCommandStringOption,
	SlashCommandUserOption,
	ThreadAutoArchiveDuration,
} from "discord.js";
import { nanoid } from "nanoid";
import { itemMatcher } from "../services/itemMatcher.js";
import {
	buildCompleteButton,
	findTradeForInteraction,
	formatMatchedItems,
	lockTradeThread,
	ratingStore,
	resolveTradeChannel,
	syncTradeRatingState,
	tradeStore,
} from "../services/core.js";
import { RatingRecord, RatingTargetRole, TradeRecord } from "../types.js";

export interface CommandDefinition {
	data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
	execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

function buildRatingOption(option: SlashCommandStringOption) {
	return option
		.setName("result")
		.setDescription("How was this trade partner?")
		.setRequired(true)
		.addChoices(
			{ name: "Positive", value: "positive" },
			{ name: "Negative", value: "negative" }
		);
}

export const tradeCommand: CommandDefinition = {
	data: new SlashCommandBuilder()
		.setName("trade")
		.setDescription("Open a trade thread and log the transaction")
		.addUserOption((option: SlashCommandUserOption) =>
			option.setName("buyer").setDescription("Who will receive the item").setRequired(true)
		)
		.addStringOption((option: SlashCommandStringOption) =>
			option
				.setName("item")
				.setDescription("Item(s) being traded. Separate multiples with commas.")
				.setRequired(true)
		)
		.addStringOption((option: SlashCommandStringOption) =>
			option.setName("price").setDescription("Optional price or barter details")
		)
		.addStringOption((option: SlashCommandStringOption) =>
			option.setName("notes").setDescription("Any additional context for the trade")
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
	async execute(interaction) {
		const buyer = interaction.options.getUser("buyer", true);
		const itemInput = interaction.options.getString("item", true);
		const seller = interaction.user;

		if (buyer.bot) {
			await interaction.reply({
				content: "Please pick a real player, not a bot... I might just give you a negative rep for this fumble",
				ephemeral: true,
			});
			return;
		}

		const price = interaction.options.getString("price") ?? undefined;
		const notes = interaction.options.getString("notes") ?? undefined;

		const matches = await itemMatcher.match(itemInput);
		const matchSummary = formatMatchedItems(matches);

		try {
			const tradeId = nanoid(10);
			const channel = await resolveTradeChannel(interaction);
			const threadName = `trade-${seller.username.slice(0, 15)}-to-${buyer.username.slice(0, 15)}`.toLowerCase();
			const thread = await channel.threads.create({
				name: threadName,
				type: ChannelType.PrivateThread,
				autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
				reason: `Trade between ${seller.tag} and ${buyer.tag}`,
				invitable: false,
			});
			await thread.members.add(seller.id);
			await thread.members.add(buyer.id);

			const summaryLines = [
				`**Seller:** ${seller} (${seller.tag})`,
				`**Buyer:** ${buyer} (${buyer.tag})`,
				`**Items:**\n${matchSummary}`,
			];
			if (price) summaryLines.push(`**Price:** ${price}`);
			if (notes) summaryLines.push(`**Notes:** ${notes}`);

			const summaryMessage = await thread.send({
				content: summaryLines.join("\n"),
				components: [buildCompleteButton(tradeId)],
			});

			const trade: TradeRecord = {
				id: tradeId,
				sellerId: seller.id,
				buyerId: buyer.id,
				createdAt: new Date().toISOString(),
				channelId: channel.id,
				threadId: thread.id,
				itemInput,
				matchedItems: matches,
				price,
				notes,
				status: "open",
				summaryMessageId: summaryMessage.id,
			};

			await tradeStore.save(trade);

			await interaction.reply({
				content: `Thread created in ${channel} with ID **${trade.id}**. Share this ID with the buyer for rating.`,
				ephemeral: true,
			});
		} catch (error) {
			console.error("Failed to create trade thread", error);
			const message =
				error instanceof Error
					? error.message
					: "The trade thread could not be created. Please let a Union Clerk know.";
			if (interaction.deferred || interaction.replied) {
				await interaction.followUp({ content: message, ephemeral: true });
			} else {
				await interaction.reply({ content: message, ephemeral: true });
			}
		}
	},
};

export const tradeEditCommand: CommandDefinition = {
	data: new SlashCommandBuilder()
		.setName("tradeedit")
		.setDescription("Update the recorded items for an existing trade")
		.addStringOption((option: SlashCommandStringOption) =>
			option
				.setName("items")
				.setDescription("Replacement item list. Separate multiples with commas.")
				.setRequired(true)
		)
		.addStringOption((option: SlashCommandStringOption) =>
			option.setName("trade_id").setDescription("Trade ID (optional if you run this inside the trade thread)")
		)
		.addStringOption((option: SlashCommandStringOption) =>
			option.setName("reason").setDescription("Optional context for why the items changed")
		),
	async execute(interaction) {
		const itemsInput = interaction.options.getString("items", true);
		const tradeIdInput = interaction.options.getString("trade_id") ?? undefined;
		const reason = interaction.options.getString("reason") ?? undefined;

		const trade = await findTradeForInteraction(interaction, tradeIdInput);
		if (!trade) {
			await interaction.reply({
				content: "I couldn't find that trade. Provide a valid trade ID or run this inside the trade thread.",
				ephemeral: true,
			});
			return;
		}

		if (trade.sellerId !== interaction.user.id) {
			await interaction.reply({
				content: "Only the recorded seller can update the items for this trade.",
				ephemeral: true,
			});
			return;
		}

		const matches = await itemMatcher.match(itemsInput);
		await tradeStore.update(trade.id, (record) => {
			record.itemInput = itemsInput;
			record.matchedItems = matches;
		});

		const summary = formatMatchedItems(matches);
		const lines = [
			`Items updated by ${interaction.user} (${interaction.user.tag}), If you've got any ideas on improving the item database, let a Union Clerk know!`,
			`**New items:**\n${summary}`,
		];
		if (reason) {
			lines.push(`**Reason:** ${reason}`);
		}

		const thread = await interaction.client.channels.fetch(trade.threadId).catch(() => null);
		if (thread && thread.isThread()) {
			await thread.send(lines.join("\n"));
		}

		await interaction.reply({
			content: "The trade's items have been updated and the thread was notified.",
			ephemeral: true,
		});
	},
};

export const rateCommand: CommandDefinition = {
	data: new SlashCommandBuilder()
		.setName("rate")
		.setDescription("Review your trade partner once everything is delivered")
		.addStringOption((option: SlashCommandStringOption) => buildRatingOption(option))
		.addStringOption((option: SlashCommandStringOption) =>
			option
				.setName("target")
				.setDescription("Who are you reviewing? Defaults to the other participant.")
				.addChoices(
					{ name: "Seller", value: "seller" },
					{ name: "Buyer", value: "buyer" }
				)
		)
		.addStringOption((option: SlashCommandStringOption) =>
			option.setName("trade_id").setDescription("Trade ID (optional if you run this inside the thread)")
		)
		.addStringOption((option: SlashCommandStringOption) =>
			option.setName("comments").setDescription("Optional public feedback")
		),
	async execute(interaction) {
		const requestedTradeId = interaction.options.getString("trade_id") ?? undefined;
		const trade = await findTradeForInteraction(interaction, requestedTradeId);
		if (!trade) {
			await interaction.reply({
				content: "I can't find that trade. Provide a valid trade ID or use this inside the trade thread.",
				ephemeral: true,
			});
			return;
		}

		const targetPreference = interaction.options.getString("target") as RatingTargetRole | null;
		const targetRole = resolveTargetRoleForUser(trade, interaction.user.id, targetPreference);
		if (!targetRole) {
			await interaction.reply({
				content: "You need to be the seller or buyer on this trade to leave a review.",
				ephemeral: true,
			});
			return;
		}

		const expectedReviewerId = targetRole === "seller" ? trade.buyerId : trade.sellerId;
		if (interaction.user.id !== expectedReviewerId) {
			await interaction.reply({ content: "You can only review your counterparty.", ephemeral: true });
			return;
		}

		const existingRating = await ratingStore.findByTradeAndRole(trade.id, targetRole);
		if (existingRating) {
			await interaction.reply({
				content: "A review for that participant is already on file.",
				ephemeral: true,
			});
			return;
		}

		const ratingValue = interaction.options.getString("result", true) === "positive" ? 1 : -1;
		const comments = interaction.options.getString("comments") ?? undefined;
		const targetUserId = targetRole === "seller" ? trade.sellerId : trade.buyerId;
		const reviewerLabel = targetRole === "seller" ? "buyer" : "seller";

		const rating: RatingRecord = {
			id: nanoid(10),
			tradeId: trade.id,
			targetRole,
			targetUserId,
			reviewerUserId: interaction.user.id,
			rating: ratingValue,
			comments,
			createdAt: new Date().toISOString(),
		};

		await ratingStore.add(rating);
		const ratingState = await syncTradeRatingState(trade);

		const summary = ratingValue === 1 ? "✅ Positive" : "⚠️ Negative";
		const replyLines = [
			`${summary} review for the ${targetRole} <@${targetUserId}> by the ${reviewerLabel} <@${interaction.user.id}>`,
			`Trade ID: **${trade.id}**`,
		];
		if (comments) replyLines.push(`Comments: ${comments}`);

		if (interaction.channel && interaction.channel.isThread()) {
			await interaction.channel.send(replyLines.join("\n"));
		}

		if (ratingState.completed) {
			await lockTradeThread(interaction.client, trade);
		}

		await interaction.reply({ content: "Your review has been logged. Thank you!", ephemeral: true });
	},
};

export const profileCommand: CommandDefinition = {
	data: new SlashCommandBuilder()
		.setName("seller")
		.setDescription("Show a trader's reputation summary")
		.addUserOption((option: SlashCommandUserOption) =>
			option.setName("user").setDescription("Seller to inspect")
		),
	async execute(interaction) {
		const target = interaction.options.getUser("user") ?? interaction.user;
		const summary = await ratingStore.summaryForUser(target.id);

		await interaction.reply({
			content: [
				`Reputation for ${target} (${target.tag})`,
				`**Score:** ${summary.score}`,
				`**Positive:** ${summary.totalPositive}`,
				`**Negative:** ${summary.totalNegative}`,
			].join("\n"),
			ephemeral: true,
		});
	},
};

function resolveTargetRoleForUser(
	trade: TradeRecord,
	userId: string,
	override?: RatingTargetRole | null
): RatingTargetRole | null {
	const isBuyer = userId === trade.buyerId;
	const isSeller = userId === trade.sellerId;
	if (!isBuyer && !isSeller) {
		return null;
	}

	if (override) {
		return override;
	}

	return isBuyer ? "seller" : "buyer";
}
