import type { MarketplaceRepository } from '../repositories/types';
import { loadAiConfig } from './config';
import { AiProviderUpstreamError, GeminiAiProvider } from './geminiProvider';
import { sanitizeAiOutput, sanitizeHistory, validateAiInput } from './guardrails';
import { AiToolExecutionError, gatherMarketplaceContext } from './marketplaceTools';
import { MockAiProvider } from './mockProvider';
import { buildAiSystemInstruction } from './systemPrompt';
import type {
  AiChatResponse,
  AiConfig,
  AiMarketplaceContext,
  AiProvider,
  AiStatusResponse,
} from './types';
import { AiUsageLimiter } from './usageLimiter';

export class AiServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'AiServiceError';
  }
}

function buildSuggestedFollowUps(context: AiMarketplaceContext): string[] {
  const { intent, clarificationStage, listings, normalizedQuery } = context;

  // Avoid forcing menu chips onto greetings, small talk, or mid-clarification turns
  if (
    intent === 'greeting' ||
    intent === 'casual_chat' ||
    clarificationStage === 'ask_region' ||
    clarificationStage === 'ask_budget'
  ) {
    return [];
  }

  if (intent === 'marketplace_search') {
    if (listings.length === 0) {
      return [
        normalizedQuery.maxPrice ? 'ارفع السعر وخله بدون حد' : 'اعرض كل المناطق',
        'ورني أسعار السلالات الاسترشادية',
      ];
    }
    return [
      'أبغى ذكور فقط',
      'خل السعر 2500',
      'لا، قصدي نجدي',
    ];
  }

  if (intent === 'breed_prices') {
    return [
      'أبي نعيمي بالرياض تحت 2000',
      'ورني عروض الحري في الطائف',
      'كيف أعرف إن المربي موثق؟',
    ];
  }

  if (intent === 'marketplace_help') {
    return [
      'أبي نعيمي بالرياض تحت 2000',
      'كم أسعار الحري والنجدي؟',
    ];
  }

  return [];
}

export interface AiServiceDeps {
  repo: MarketplaceRepository;
  config?: AiConfig;
  provider?: AiProvider;
  now?: () => number;
}

export class AiAssistantService {
  readonly config: AiConfig;
  private readonly repo: MarketplaceRepository;
  private readonly limiter: AiUsageLimiter;
  private readonly provider: AiProvider;
  private readonly usesGemini: boolean;

  constructor(deps: AiServiceDeps) {
    this.repo = deps.repo;
    this.config = deps.config || loadAiConfig();
    this.limiter = new AiUsageLimiter({
      rateLimitPerMinute: this.config.rateLimitPerMinute,
      dailyUserQuota: this.config.dailyUserQuota,
      dailyIpQuota: this.config.dailyIpQuota,
      now: deps.now,
    });

    if (deps.provider) {
      this.provider = deps.provider;
      this.usesGemini = deps.provider.name === 'gemini';
    } else if (
      this.config.providerMode === 'gemini' ||
      (this.config.providerMode === 'auto' && Boolean(this.config.geminiApiKey))
    ) {
      this.provider = new GeminiAiProvider(this.config, this.repo);
      this.usesGemini = true;
    } else {
      this.provider = new MockAiProvider();
      this.usesGemini = false;
    }
  }

  getStatus(actorKey: string, isAuthenticated: boolean): AiStatusResponse {
    return {
      enabled: this.config.enabled,
      mode: this.usesGemini ? 'gemini' : 'fallback',
      geminiConfigured: Boolean(this.config.geminiApiKey),
      model: this.config.model,
      maxMessageLength: this.config.maxMessageLength,
      usage: this.limiter.peek(actorKey, isAuthenticated),
    };
  }

  async chat(params: {
    actorKey: string;
    isAuthenticated: boolean;
    message: unknown;
    history?: unknown;
  }): Promise<AiChatResponse> {
    if (!this.config.enabled) {
      throw new AiServiceError(
        503,
        'المساعد الذكي متوقف مؤقتاً للصيانة.',
        'ai_disabled'
      );
    }

    const inputCheck = validateAiInput(params.message, this.config.maxMessageLength);
    if (!inputCheck.ok) {
      throw new AiServiceError(
        400,
        inputCheck.error || 'طلب غير صالح.',
        inputCheck.code || 'invalid_input'
      );
    }

    const quota = this.limiter.consume(params.actorKey, params.isAuthenticated);
    if (!quota.allowed) {
      const msg =
        quota.reason === 'daily_quota_exceeded'
          ? 'وصلت إلى الحد اليومي المسموح لاستخدام المساعد الذكي. يمكنك متابعة تصفح الإعلانات مباشرة أو المحاولة غداً.'
          : 'أرسلت رسائل سريعة متتالية، يرجى الانتظار قليلاً قبل إرسال رسالة جديدة.';
      throw new AiServiceError(429, msg, quota.reason || 'rate_limited', quota.retryAfterSeconds);
    }

    const history = sanitizeHistory(
      params.history,
      this.config.maxHistoryMessages,
      this.config.maxMessageLength
    );

    let context: AiMarketplaceContext;
    try {
      context = await gatherMarketplaceContext(
        this.repo,
        inputCheck.sanitizedMessage,
        history
      );
    } catch (err) {
      if (err instanceof AiToolExecutionError) {
        throw new AiServiceError(503, err.message, 'ai_tool_failure');
      }
      throw new AiServiceError(
        503,
        'تعذر الوصول إلى بيانات السوق حالياً، حاول مرة أخرى بعد قليل.',
        'ai_tool_failure'
      );
    }

    const systemInstruction = buildAiSystemInstruction(context);

    let rawOutput;
    try {
      rawOutput = await this.provider.generateReply({
        userMessage: inputCheck.sanitizedMessage,
        history,
        systemInstruction,
        context,
      });
    } catch (err) {
      if (err instanceof AiProviderUpstreamError) {
        throw new AiServiceError(err.status, err.message, err.code);
      }
      if (err instanceof AiToolExecutionError) {
        throw new AiServiceError(503, err.message, 'ai_tool_failure');
      }
      throw new AiServiceError(
        502,
        'المساعد الذكي غير متاح مؤقتاً في هذه اللحظة. تقدر تبحث مباشرة في قائمة الإعلانات أو تحاول بعد لحظات.',
        'ai_provider_failure'
      );
    }

    const safeReply = sanitizeAiOutput(rawOutput.text);
    const allowContextListings =
      context.intent === 'marketplace_search' &&
      context.clarificationStage === 'execute_search';

    const cards = rawOutput.toolSearchExecuted
      ? rawOutput.cards || []
      : allowContextListings
      ? rawOutput.cards && rawOutput.cards.length > 0
        ? rawOutput.cards
        : context.listings
      : [];

    return {
      reply: safeReply,
      intent: context.intent,
      cards,
      suggestedFollowUps: buildSuggestedFollowUps(context),
      provider: rawOutput.provider,
      usage: quota.usage,
    };
  }
}
