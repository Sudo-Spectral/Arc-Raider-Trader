export type TradeStatus = "open" | "awaiting_rating" | "completed" | "cancelled";

export interface TradeItemMatch {
  input: string;
  match: string;
  score: number;
  suggestions?: string[];
}

export interface TradeRecord {
  id: string;
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

export interface RatingRecord {
  id: string;
  tradeId: string;
  sellerId: string;
  buyerId: string;
  rating: 1 | -1;
  comments?: string;
  createdAt: string;
}

export interface RatingSummary {
  sellerId: string;
  totalPositive: number;
  totalNegative: number;
  score: number;
}
