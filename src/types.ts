export type TradeStatus = "open" | "awaiting_rating" | "completed" | "cancelled";
export type EscortStatus = "open" | "completed";
export type QuestStatus = "open" | "in_progress" | "completed" | "cancelled";

export interface BaseTaskRecord {
  id: string;
  interactionId?: string;
  createdAt: string;
  channelId: string;
  threadId: string;
}

export interface TradeItemMatch {
  input: string;
  match: string;
  score: number;
  suggestions?: string[];
}

export interface TradeRecord extends BaseTaskRecord {
  sellerId: string;
  buyerId: string;
  itemInput: string;
  matchedItems: TradeItemMatch[];
  price?: string;
  notes?: string;
  status: TradeStatus;
  summaryMessageId?: string;
}

export interface EscortRecord extends BaseTaskRecord {
  escortId: string;
  clientId: string;
  route: string;
  payment?: string;
  notes?: string;
  status: EscortStatus;
  summaryMessageId?: string;
}

export interface QuestRecord extends BaseTaskRecord {
  title: string;
  description: string;
  rewardRep: number;
  rewardItems?: string;
  notes?: string;
  deadline?: string;
  creatorId: string;
  assigneeId?: string;
  status: QuestStatus;
  summaryMessageId?: string;
  completedAt?: string;
  completedById?: string;
  rewardRecipientId?: string;
}

export type RatingTargetRole = "seller" | "buyer";

export interface RatingRecord {
  id: string;
  tradeId: string;
  targetRole: RatingTargetRole;
  targetUserId: string;
  reviewerUserId: string;
  rating: 1 | -1;
  comments?: string;
  createdAt: string;
}

export interface RatingSummary {
  userId: string;
  totalPositive: number;
  totalNegative: number;
  score: number;
}

export type RepSourceType = "trade_rating" | "escort" | "quest" | "event" | "manual";

export interface RepEntry {
  id: string;
  userId: string;
  amount: number;
  source: {
    type: RepSourceType;
    recordId?: string;
  };
  reason: string;
  createdAt: string;
  createdBy: string;
}

export interface RepSummary {
  userId: string;
  total: number;
  positiveRatings: number;
  negativeRatings: number;
  entries: number;
  breakdown: Partial<Record<RepSourceType, number>>;
}
