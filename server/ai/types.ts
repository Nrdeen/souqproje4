export type AiIntent =
  | 'marketplace_search'
  | 'breed_prices'
  | 'marketplace_help'
  | 'general_livestock'
  | 'casual_chat'
  | 'greeting';

export type AiClarificationStage = 'none' | 'ask_region' | 'ask_budget' | 'execute_search';

export type AiProviderName = 'gemini' | 'mock';

export interface AiChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiChatRequest {
  message: string;
  history?: AiChatHistoryItem[];
}

/** Strictly public, read-only listing summary returned by AI assistant cards. Never contains private seller phones/emails/IDs. */
export interface AiListingCard {
  id: string;
  title: string;
  priceAmount: number;
  currency: 'SAR';
  city: string;
  regionName: string;
  breedName: string;
  categoryName: string;
  ageMonths: number;
  weightKg: number;
  quantity: number;
  vaccinated: boolean;
  isNegotiable: boolean;
  allowPriceOffers: boolean;
  imageUrl: string | null;
  sellerDisplayName: string;
  sellerVerified: boolean;
  likesCount: number;
}

export interface NormalizedSaudiQuery {
  rawQuery: string;
  normalizedText: string;
  searchKeywords: string;
  breedId?: string;
  categoryId?: string;
  subCategoryId?: string;
  regionId?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  sex?: 'ذكر' | 'أنثى' | 'قطيع مختلط';
  vaccinatedOnly?: boolean;
  negotiableOnly?: boolean;
  acceptsOffersOnly?: boolean;
  sort?: 'newest' | 'oldest' | 'price_asc' | 'price_desc' | 'most_liked';
  detectedDialectTerms: string[];
}

export interface AiBreedPriceGuide {
  breedId: string;
  breedName: string;
  origin: string;
  avgWeightKg: string;
  priceRangeSar: string;
  summary: string;
  indicativeEntries: Array<{
    ageLabel: string;
    minPriceSar: number;
    maxPriceSar: number;
    marketNote: string;
  }>;
}

export interface AiMarketplaceContext {
  intent: AiIntent;
  normalizedQuery: NormalizedSaudiQuery;
  turnQuery?: NormalizedSaudiQuery;
  clarificationStage?: AiClarificationStage;
  isFilterModification?: boolean;
  listings: AiListingCard[];
  totalMatchingListings: number;
  breedGuides: AiBreedPriceGuide[];
  helpTopics: string[];
}

export interface AiUsageSnapshot {
  remainingToday: number;
  dailyLimit: number;
  usedToday: number;
  resetAtIso: string;
}

export interface AiChatResponse {
  reply: string;
  intent: AiIntent;
  cards: AiListingCard[];
  suggestedFollowUps: string[];
  provider: AiProviderName;
  usage: AiUsageSnapshot;
}

export interface AiStatusResponse {
  enabled: boolean;
  mode: 'gemini' | 'fallback';
  geminiConfigured: boolean;
  model: string;
  maxMessageLength: number;
  usage: AiUsageSnapshot;
}

export interface AiConfig {
  enabled: boolean;
  geminiApiKey: string;
  model: string;
  providerMode: 'auto' | 'gemini' | 'mock';
  maxMessageLength: number;
  maxHistoryMessages: number;
  rateLimitPerMinute: number;
  dailyUserQuota: number;
  dailyIpQuota: number;
  timeoutMs: number;
}

export interface AiProviderInput {
  userMessage: string;
  history: AiChatHistoryItem[];
  systemInstruction: string;
  context: AiMarketplaceContext;
}

export interface AiProviderOutput {
  text: string;
  provider: AiProviderName;
  cards?: AiListingCard[];
  toolSearchExecuted?: boolean;
}

export interface AiProvider {
  readonly name: AiProviderName;
  generateReply(input: AiProviderInput): Promise<AiProviderOutput>;
}
