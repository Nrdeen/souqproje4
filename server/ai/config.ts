import type { AiConfig } from './types';

export const DEFAULT_AI_MODEL = 'gemini-4-hydrogen';

const DEPRECATED_MODELS = new Set([
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
  'gemini-2.0-flash',
  'gemini-2.0-pro',
  'gemini-2.0-flash-thinking',
]);

function intFromEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value || !value.trim()) return fallback;
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

function sanitizeApiKey(raw: string | undefined): string {
  const key = (raw || '').trim();
  if (!key) return '';
  if (key === 'MY_GEMINI_API_KEY' || key.startsWith('REPLACE_WITH_')) {
    return '';
  }
  return key;
}

function resolveModel(raw: string | undefined): string {
  const model = (raw || '').trim();
  if (!model || DEPRECATED_MODELS.has(model)) {
    return DEFAULT_AI_MODEL;
  }
  return model;
}

function resolveProviderMode(raw: string | undefined): 'auto' | 'gemini' | 'mock' {
  const mode = (raw || '').trim().toLowerCase();
  if (mode === 'gemini' || mode === 'mock' || mode === 'auto') {
    return mode;
  }
  return 'auto';
}

export function loadAiConfig(
  env: Record<string, string | undefined> = process.env,
  overrides: Partial<AiConfig> = {}
): AiConfig {
  const enabled = (env.AI_ASSISTANT_ENABLED || 'true').trim().toLowerCase() !== 'false';
  const geminiApiKey = sanitizeApiKey(env.GEMINI_API_KEY);
  const model = resolveModel(env.AI_MODEL);
  const providerMode = resolveProviderMode(env.AI_PROVIDER);

  return {
    enabled,
    geminiApiKey,
    model,
    providerMode,
    maxMessageLength: intFromEnv(env.AI_MAX_MESSAGE_LENGTH, 600, 100, 2000),
    maxHistoryMessages: intFromEnv(env.AI_MAX_HISTORY_MESSAGES, 8, 0, 20),
    rateLimitPerMinute: intFromEnv(env.AI_RATE_LIMIT_PER_MIN, 10, 1, 120),
    dailyUserQuota: intFromEnv(env.AI_DAILY_USER_QUOTA, 30, 1, 500),
    dailyIpQuota: intFromEnv(env.AI_DAILY_IP_QUOTA, 20, 1, 500),
    timeoutMs: intFromEnv(env.AI_TIMEOUT_MS, 30_000, 1_000, 60_000),
    ...overrides,
  };
}
