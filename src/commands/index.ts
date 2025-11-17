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
import { repStore } from "../services/repStore.js";
import { acquireInteractionLock } from "../services/interactionLock.js";
import { buildEscortCompleteButton, escortStore, resolveEscortChannel } from "../services/escort.js";
import { buildQuestCompleteButton, questStore, resolveQuestChannel } from "../services/quest.js";
import { formatLogMessage, logActivity } from "../services/activityLog.js";
import { EscortRecord, QuestRecord, RatingRecord, RatingTargetRole, TradeRecord } from "../types.js";

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
		const interactionLock = await acquireInteractionLock(interaction.id);
		if (!interactionLock) {
			await interaction.reply({
				content: "I'm already processing that trade request. Please give me a moment and try again if needed.",
				ephemeral: true,
			});
			return;
		}

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
			const existingTrade = await tradeStore.getByInteractionId(interaction.id);
			if (existingTrade) {
				await interaction.reply({
					content: `This trade already exists in <#${existingTrade.threadId}> with ID **${existingTrade.id}**. Share that ID with the buyer for rating.`,
					ephemeral: true,
				});
				return;
			}

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
				interactionId: interaction.id,
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

			await logActivity(interaction.client, {
				content: formatLogMessage([
					"🛒 **Trade opened**",
					`ID: ${trade.id}`,
					`Seller: ${seller} (${seller.tag})`,
					`Buyer: ${buyer} (${buyer.tag})`,
					`Items: ${itemInput}`,
					price ? `Price: ${price}` : undefined,
					notes ? `Notes: ${notes}` : undefined,
					`Thread: <#${thread.id}>`,
				]),
			});

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
		} finally {
			await interactionLock.release();
		}
	},
};

export const escortCommand: CommandDefinition = {
	data: new SlashCommandBuilder()
		.setName("escort")
		.setDescription("Open an escort mission thread and log the objective")
		.addUserOption((option: SlashCommandUserOption) =>
			option.setName("client").setDescription("Who needs protection").setRequired(true)
		)
		.addStringOption((option: SlashCommandStringOption) =>
			option
				.setName("route")
				.setDescription("Route, destination, or mission objective")
				.setRequired(true)
		)
		.addStringOption((option: SlashCommandStringOption) =>
			option
				.setName("payment")
				.setDescription("Optional promised payment (items, currency, favors)")
		)
		.addStringOption((option: SlashCommandStringOption) =>
			option.setName("notes").setDescription("Any extra context for the mission")
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
	async execute(interaction) {
		const interactionLock = await acquireInteractionLock(interaction.id);
		if (!interactionLock) {
			await interaction.reply({
				content: "I'm already processing that escort request. Please try again if you don't see the thread soon.",
				ephemeral: true,
			});
			return;
		}

		const client = interaction.options.getUser("client", true);
		const route = interaction.options.getString("route", true);
		const payment = interaction.options.getString("payment") ?? undefined;
		const notes = interaction.options.getString("notes") ?? undefined;
		const escort = interaction.user;

		if (client.bot) {
			await interaction.reply({
				content: "You can't escort a bot. Pick a real Union member so I know who to ping.",
				ephemeral: true,
			});
			await interactionLock.release();
			return;
		}

		if (client.id === escort.id) {
			await interaction.reply({
				content: "Nice try, but you can't be your own escort client.",
				ephemeral: true,
			});
			await interactionLock.release();
			return;
		}

		try {
			const existingEscort = await escortStore.getByInteractionId(interaction.id);
			if (existingEscort) {
				await interaction.reply({
					content: `This escort mission already exists in <#${existingEscort.threadId}> with ID **${existingEscort.id}**.`,
					ephemeral: true,
				});
				return;
			}

			const channel = await resolveEscortChannel(interaction);
			const missionId = nanoid(10);
			const threadName = `escort-${escort.username.slice(0, 15)}-to-${client.username.slice(0, 15)}`.toLowerCase();
			const thread = await channel.threads.create({
				name: threadName,
				type: ChannelType.PrivateThread,
				autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
				reason: `Escort mission between ${escort.tag} and ${client.tag}`,
				invitable: false,
			});
			await thread.members.add(escort.id);
			await thread.members.add(client.id);

			const summaryLines = [
				`**Escort:** ${escort} (${escort.tag})`,
				`**Client:** ${client} (${client.tag})`,
				`**Objective:** ${route}`,
			];
			if (payment) summaryLines.push(`**Promised payment:** ${payment}`);
			if (notes) summaryLines.push(`**Notes:** ${notes}`);

			const summaryMessage = await thread.send({
				content: summaryLines.join("\n"),
				components: [buildEscortCompleteButton(missionId)],
			});

			const escortRecord: EscortRecord = {
				id: missionId,
				interactionId: interaction.id,
				createdAt: new Date().toISOString(),
				channelId: channel.id,
				threadId: thread.id,
				escortId: escort.id,
				clientId: client.id,
				route,
				payment,
				notes,
				status: "open",
				summaryMessageId: summaryMessage.id,
			};

			await escortStore.save(escortRecord);

			await interaction.reply({
				content: `Escort mission thread created in ${channel} with ID **${escortRecord.id}**.`,
				ephemeral: true,
			});

			await logActivity(interaction.client, {
				content: formatLogMessage([
					"🛡️ **Escort mission opened**",
					`ID: ${escortRecord.id}`,
					`Escort: ${escort} (${escort.tag})`,
					`Client: ${client} (${client.tag})`,
					`Objective: ${route}`,
					payment ? `Promised payment: ${payment}` : undefined,
					notes ? `Notes: ${notes}` : undefined,
					`Thread: <#${thread.id}>`,
				]),
			});
		} catch (error) {
			console.error("Failed to create escort mission", error);
			const message =
				error instanceof Error
					? error.message
					: "I couldn't create the escort mission. Please ping a Union Clerk.";
			if (interaction.deferred || interaction.replied) {
				await interaction.followUp({ content: message, ephemeral: true });
			} else {
				await interaction.reply({ content: message, ephemeral: true });
			}
		} finally {
			await interactionLock.release();
		}
	},
};

export const questCommand: CommandDefinition = {
	data: new SlashCommandBuilder()
		.setName("quest")
		.setDescription("Post a quest or bounty and manage its status")
		.addStringOption((option: SlashCommandStringOption) =>
			option.setName("title").setDescription("Quest title").setRequired(true)
		)
		.addStringOption((option: SlashCommandStringOption) =>
			option.setName("description").setDescription("Quest objective").setRequired(true)
		)
		.addIntegerOption((option) =>
			option
				.setName("reward_rep")
				.setDescription("Reputation awarded on completion (default 1)")
				.setMinValue(1)
		)
		.addStringOption((option: SlashCommandStringOption) =>
			option.setName("reward_items").setDescription("Promised items or payment")
		)
		.addUserOption((option: SlashCommandUserOption) =>
			option.setName("assignee").setDescription("Optional operative to assign immediately")
		)
		.addStringOption((option: SlashCommandStringOption) =>
			option
				.setName("deadline")
				.setDescription("Optional deadline (ISO datetime or human string)")
		)
		.addStringOption((option: SlashCommandStringOption) =>
			option.setName("notes").setDescription("Extra instructions")
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
	async execute(interaction) {
		const interactionLock = await acquireInteractionLock(interaction.id);
		if (!interactionLock) {
			await interaction.reply({
				content: "I'm already creating that quest. Please wait for the thread to appear.",
				ephemeral: true,
			});
			return;
		}

		const title = interaction.options.getString("title", true);
		const description = interaction.options.getString("description", true);
		const rewardRep = interaction.options.getInteger("reward_rep") ?? 1;
		const rewardItems = interaction.options.getString("reward_items") ?? undefined;
		const assignee = interaction.options.getUser("assignee") ?? undefined;
		const deadline = interaction.options.getString("deadline") ?? undefined;
		const notes = interaction.options.getString("notes") ?? undefined;
		const creator = interaction.user;

		try {
			const existingQuest = await questStore.getByInteractionId(interaction.id);
			if (existingQuest) {
				await interaction.reply({
					content: `This quest already exists in <#${existingQuest.threadId}> with ID **${existingQuest.id}**.`,
					ephemeral: true,
				});
				return;
			}

			const channel = await resolveQuestChannel(interaction);
			const questId = nanoid(10);
			const threadName = `quest-${title.slice(0, 45)}`.toLowerCase();
			const thread = await channel.threads.create({
				name: threadName,
				type: ChannelType.PrivateThread,
				autoArchiveDuration: ThreadAutoArchiveDuration.ThreeDays,
				reason: `Quest posted by ${creator.tag}`,
				invitable: false,
			});
			await thread.members.add(creator.id);
			if (assignee) {
				await thread.members.add(assignee.id);
			}

			const summaryLines = [
				`**Quest:** ${title}`,
				`**Posted by:** ${creator} (${creator.tag})`,
				`**Description:** ${description}`,
				`**Reward:** ${rewardRep} rep` + (rewardItems ? ` + ${rewardItems}` : ""),
			];
			if (assignee) summaryLines.push(`**Assigned to:** ${assignee} (${assignee.tag})`);
			if (deadline) summaryLines.push(`**Deadline:** ${deadline}`);
			if (notes) summaryLines.push(`**Notes:** ${notes}`);

			const summaryMessage = await thread.send({
				content: summaryLines.join("\n"),
				components: [buildQuestCompleteButton(questId, Boolean(assignee && assignee.bot))],
			});

			const questRecord: QuestRecord = {
				id: questId,
				interactionId: interaction.id,
				createdAt: new Date().toISOString(),
				channelId: channel.id,
				threadId: thread.id,
				title,
				description,
				rewardRep,
				rewardItems,
				notes,
				deadline,
				creatorId: creator.id,
				assigneeId: assignee?.id,
				status: "open",
				summaryMessageId: summaryMessage.id,
			};

			await questStore.save(questRecord);

			await interaction.reply({
				content: `Quest thread created in ${channel} with ID **${questRecord.id}**.`,
				ephemeral: true,
			});

			await logActivity(interaction.client, {
				content: formatLogMessage([
					"🎯 **Quest posted**",
					`ID: ${questRecord.id}`,
					`Title: ${title}`,
					`Reward: ${rewardRep} rep${rewardItems ? ` + ${rewardItems}` : ""}`,
					`Posted by: ${creator} (${creator.tag})`,
					assignee ? `Assigned operative: ${assignee} (${assignee.tag})` : undefined,
					deadline ? `Deadline: ${deadline}` : undefined,
					notes ? `Notes: ${notes}` : undefined,
					`Thread: <#${thread.id}>`,
				]),
			});
		} catch (error) {
			console.error("Failed to create quest", error);
			const message =
				error instanceof Error
					? error.message
					: "I couldn't create that quest. Please alert a Union Clerk.";
			if (interaction.deferred || interaction.replied) {
				await interaction.followUp({ content: message, ephemeral: true });
			} else {
				await interaction.reply({ content: message, ephemeral: true });
			}
		} finally {
			await interactionLock.release();
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

		await logActivity(interaction.client, {
			content: formatLogMessage([
				"✏️ **Trade items updated**",
				`ID: ${trade.id}`,
				`Actor: ${interaction.user} (${interaction.user.tag})`,
				`Thread: <#${trade.threadId}>`,
				reason ? `Reason: ${reason}` : undefined,
				`Items: ${itemsInput}`,
			]),
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
		await repStore.add({
			id: nanoid(10),
			userId: targetUserId,
			amount: ratingValue,
			source: {
				type: "trade_rating",
				recordId: trade.id,
			},
			reason: ratingValue === 1 ? "Positive trade review" : "Negative trade review",
			createdAt: new Date().toISOString(),
			createdBy: interaction.user.id,
		});
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

		await logActivity(interaction.client, {
			content: formatLogMessage([
				`${ratingValue === 1 ? "🟢" : "🔴"} **Trade review submitted**`,
				`Trade ID: ${trade.id}`,
				`Target (${targetRole}): <@${targetUserId}>`,
				`Reviewer: ${interaction.user} (${interaction.user.tag})`,
				comments ? `Comments: ${comments}` : undefined,
			]),
		});
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
		const repSummary = await repStore.summaryForUser(target.id);
		const legacySummary = await ratingStore.summaryForUser(target.id);
		const ledgerActive = repSummary.entries > 0;
		const score = ledgerActive ? repSummary.total : legacySummary.score;
		const positive = ledgerActive ? repSummary.positiveRatings : legacySummary.totalPositive;
		const negative = ledgerActive ? repSummary.negativeRatings : legacySummary.totalNegative;

		const lines = [
			`Reputation for ${target} (${target.tag})`,
			`**Score:** ${score}`,
			`**Positive:** ${positive}`,
			`**Negative:** ${negative}`,
		];

		if (ledgerActive) {
			const nonTradeSources = Object.entries(repSummary.breakdown).filter(
				([source, amount]) => source !== "trade_rating" && (amount ?? 0) !== 0
			);
			if (nonTradeSources.length) {
				lines.push("**Other Union rep contributions:**");
				for (const [source, amount] of nonTradeSources) {
					lines.push(`• ${source.replace(/_/g, " ")}: ${amount}`);
				}
			}
		} else {
			lines.push("_Showing historic trade ratings until the new rep ledger has entries._");
		}

		await interaction.reply({
			content: lines.join("\n"),
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
