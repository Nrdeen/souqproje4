import { FunctionDeclaration, GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { MarketplaceRepository } from '../repositories/types';
import {
  AiToolExecutionError,
  executeGetBreedPriceGuidesTool,
  executeSearchPublishedListingsTool,
} from './marketplaceTools';
import type {
  AiConfig,
  AiListingCard,
  AiProvider,
  AiProviderInput,
  AiProviderOutput,
} from './types';

export class AiProviderUpstreamError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'AiProviderUpstreamError';
  }
}

const searchPublishedListingsDeclaration: FunctionDeclaration = {
  name: 'searchPublishedListings',
  description:
    'Search currently published Saudi livestock marketplace listings with optional breed, region, city, price range, sex, vaccination, and sorting filters. Only call when the user is searching for available listings or updating search filters; never call for casual greetings or chitchat.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Free-text Saudi dialect search hint (e.g., جذعان نعيمي، هرفي حري، عوارض دفيع).',
      },
      breed: {
        type: Type.STRING,
        description: 'Saudi livestock breed name (e.g., نعيمي، نجدي، حري، عارضي، سواكني).',
      },
      region: {
        type: Type.STRING,
        description: 'Saudi region name (e.g., الرياض، مكة المكرمة، القصيم، المنطقة الشرقية).',
      },
      city: {
        type: Type.STRING,
        description: 'City name (e.g., الرياض، المزاحمية، بريدة، الطائف، جدة).',
      },
      minPrice: {
        type: Type.NUMBER,
        description: 'Minimum price in SAR.',
      },
      maxPrice: {
        type: Type.NUMBER,
        description: 'Maximum price in SAR.',
      },
      sex: {
        type: Type.STRING,
        description: 'Optional livestock sex filter: ذكر, أنثى, or قطيع مختلط.',
      },
      vaccinatedOnly: {
        type: Type.BOOLEAN,
        description: 'Set true to return only vaccinated livestock listings.',
      },
      negotiableOnly: {
        type: Type.BOOLEAN,
        description: 'Set true to return only negotiable listings.',
      },
      sort: {
        type: Type.STRING,
        description: 'Sort order: newest, price_asc, price_desc, or most_liked.',
      },
      limit: {
        type: Type.INTEGER,
        description: 'Maximum number of listings to return (1 to 4).',
      },
    },
  },
};

const getBreedPriceGuidesDeclaration: FunctionDeclaration = {
  name: 'getBreedPriceGuides',
  description:
    'Get indicative Saudi market price guides, average weights, and breed details for Saudi livestock breeds.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      breed: {
        type: Type.STRING,
        description: 'Optional breed name to filter guides (e.g., نعيمي، حري، نجدي، عارضي، سواكني).',
      },
    },
  },
};

function isRetryableUpstreamError(err: unknown): boolean {
  const status = Number((err as any)?.status || (err as any)?.statusCode || 0);
  const msg = String((err as any)?.message || '');
  if (/AbortError|timeout/i.test(msg)) return false;
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 429) {
    return false;
  }
  return status >= 500 || /ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|unavailable/i.test(msg);
}

function mapGeminiError(err: unknown): AiProviderUpstreamError {
  if (err instanceof AiProviderUpstreamError) return err;
  if (err instanceof AiToolExecutionError) {
    return new AiProviderUpstreamError(503, err.message, 'ai_tool_failure');
  }

  const status = Number((err as any)?.status || (err as any)?.statusCode || 502);
  const msg = String((err as any)?.message || '');

  if (status === 404 || /NOT_FOUND/i.test(msg)) {
    return new AiProviderUpstreamError(
      502,
      'معرف نموذج المساعد الذكي المحدد غير متاح حالياً، يرجى مراجعة إعدادات النموذج.',
      'ai_model_not_found'
    );
  }
  if (status === 400 || status === 401 || status === 403 || /API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)) {
    return new AiProviderUpstreamError(
      503,
      'المساعد الذكي غير متاح مؤقتاً في هذه اللحظة. تقدر تبحث مباشرة في قائمة الإعلانات أو تحاول بعد لحظات.',
      'ai_auth_error'
    );
  }
  if (status === 429 || /RESOURCE_EXHAUSTED/i.test(msg)) {
    return new AiProviderUpstreamError(
      429,
      'الخدمة مزدحمة الآن بشكل مؤقت، جرب مرة ثانية بعد ثوانٍ قليلة.',
      'ai_upstream_rate_limited'
    );
  }
  if (/AbortError|timeout/i.test(msg)) {
    return new AiProviderUpstreamError(
      504,
      'تأخر الرد قليلاً عن المعتاد. تقدر تعيد المحاولة الآن أو تستخدم البحث المباشر في السوق.',
      'ai_timeout'
    );
  }
  return new AiProviderUpstreamError(
    502,
    'المساعد الذكي غير متاح مؤقتاً في هذه اللحظة. تقدر تبحث مباشرة في قائمة الإعلانات أو تحاول بعد لحظات.',
    'ai_upstream_error'
  );
}

export class GeminiAiProvider implements AiProvider {
  readonly name = 'gemini' as const;
  private readonly client: GoogleGenAI;

  constructor(
    private readonly config: AiConfig,
    private readonly repo?: MarketplaceRepository,
    clientOverride?: GoogleGenAI
  ) {
    if (!clientOverride && !config.geminiApiKey) {
      throw new Error('GeminiAiProvider requires a configured GEMINI_API_KEY.');
    }
    this.client =
      clientOverride ||
      new GoogleGenAI({
        apiKey: config.geminiApiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
  }

  private async runWithDeadline<T>(promise: Promise<T>, deadlineMs: number): Promise<T> {
    const remainingMs = deadlineMs - Date.now();
    if (remainingMs <= 0) {
      throw new Error('Gemini request timeout');
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Gemini request timeout')), remainingMs);
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async callModelWithRetry(
    contents: any[],
    systemInstruction: string,
    tools: any[] | undefined,
    deadlineMs: number
  ) {
    const executeOnce = () =>
      this.runWithDeadline(
        this.client.models.generateContent({
          model: this.config.model,
          contents,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            ...(tools ? { tools } : {}),
          },
        }),
        deadlineMs
      );

    try {
      return await executeOnce();
    } catch (firstErr) {
      const remainingMs = deadlineMs - Date.now();
      if (!isRetryableUpstreamError(firstErr) || remainingMs < Math.min(2000, this.config.timeoutMs * 0.4)) {
        throw firstErr;
      }
      await new Promise((r) => setTimeout(r, 250));
      return await executeOnce();
    }
  }

  async generateReply(input: AiProviderInput): Promise<AiProviderOutput> {
    const contents: any[] = [
      ...input.history.map((h) => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      })),
      { role: 'user', parts: [{ text: input.userMessage }] },
    ];

    const allowToolsForTurn =
      Boolean(this.repo) &&
      input.context?.intent !== 'greeting' &&
      input.context?.intent !== 'casual_chat' &&
      input.context?.clarificationStage !== 'ask_region' &&
      input.context?.clarificationStage !== 'ask_budget';

    const tools = allowToolsForTurn
      ? [{ functionDeclarations: [searchPublishedListingsDeclaration, getBreedPriceGuidesDeclaration] }]
      : undefined;

    const deadlineMs = Date.now() + this.config.timeoutMs;
    const collectedCards: AiListingCard[] = [];
    let toolSearchExecuted = false;
    let toolSearchFailed = false;

    try {
      let response = await this.callModelWithRetry(contents, input.systemInstruction, tools, deadlineMs);

      // Bounded function-calling rounds (max 2)
      for (let round = 0; round < 2; round += 1) {
        const functionCalls = response.functionCalls;
        const previousContent = response.candidates?.[0]?.content;
        if (!functionCalls || functionCalls.length === 0 || !previousContent || !this.repo) {
          break;
        }

        const responseParts: any[] = [];
        for (const call of functionCalls) {
          const callArgs = (call.args && typeof call.args === 'object' ? call.args : {}) as Record<
            string,
            unknown
          >;

          if (call.name === 'searchPublishedListings') {
            toolSearchExecuted = true;
            try {
              const searchRes = await executeSearchPublishedListingsTool(this.repo, callArgs);
              collectedCards.splice(0, collectedCards.length, ...searchRes.cards);
              toolSearchFailed = false;
              responseParts.push({
                functionResponse: {
                  id: call.id,
                  name: call.name,
                  response: {
                    totalMatchingListings: searchRes.totalMatchingListings,
                    listings: searchRes.listingsSummary,
                  },
                },
              });
            } catch (toolErr) {
              toolSearchFailed = true;
              responseParts.push({
                functionResponse: {
                  id: call.id,
                  name: call.name,
                  response: {
                    error:
                      toolErr instanceof Error ? toolErr.message : 'Listing search tool unavailable',
                  },
                },
              });
            }
          } else if (call.name === 'getBreedPriceGuides') {
            try {
              const guidesRes = await executeGetBreedPriceGuidesTool(this.repo, callArgs);
              responseParts.push({
                functionResponse: {
                  id: call.id,
                  name: call.name,
                  response: guidesRes,
                },
              });
            } catch (toolErr) {
              responseParts.push({
                functionResponse: {
                  id: call.id,
                  name: call.name,
                  response: {
                    error:
                      toolErr instanceof Error ? toolErr.message : 'Breed guides lookup failed',
                  },
                },
              });
            }
          } else {
            responseParts.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: { error: 'Unsupported tool' },
              },
            });
          }
        }

        // Never allow Gemini to hallucinate or mask a failed listing search as an empty result
        if (toolSearchFailed && collectedCards.length === 0) {
          throw new AiProviderUpstreamError(
            503,
            'تعذر البحث في الإعلانات حالياً بسبب خلل مؤقت في جلب البيانات، حاول مرة أخرى بعد قليل.',
            'ai_tool_failure'
          );
        }

        contents.push(previousContent);
        contents.push({ role: 'user', parts: responseParts });

        response = await this.callModelWithRetry(contents, input.systemInstruction, tools, deadlineMs);
      }

      const text = (response.text || '').trim();
      if (!text) {
        throw new AiProviderUpstreamError(
          502,
          'لم يتمكن المساعد من توليد رد واضح، يرجى إعادة صياغة سؤالك.',
          'ai_empty_response'
        );
      }

      return {
        text,
        provider: 'gemini',
        toolSearchExecuted,
        ...(toolSearchExecuted ? { cards: collectedCards } : {}),
      };
    } catch (err) {
      throw mapGeminiError(err);
    }
  }
}
