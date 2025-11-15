export type TradeStatus = "open" | "awaiting_rating" | "completed" | "cancelled";

export interface TradeItemMatch {
  input: string;
  match: string;
  score: number;
  suggestions?: string[];
}

export interface TradeRecord {
  id: string;
  interactionId?: string;
  sellerId: string;
  buyerId: string;
  createdAt: string;
  channelId: string;
  threadId: string;
  itemInput: string;
  matchedItems: TradeItemMatch[];
  price?: string;
  notes?: string;
  status: TradeStatus;
  summaryMessageId?: string;
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
