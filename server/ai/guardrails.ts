import type { AiChatHistoryItem } from './types';

export interface GuardrailValidationResult {
  ok: boolean;
  sanitizedMessage: string;
  error?: string;
  code?: 'invalid_input' | 'message_too_long' | 'prompt_injection_blocked';
}

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /\bignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions?|prompts?|rules?)\b/i,
  /\bdisregard\s+(?:your\s+)?(?:system|developer)\s+(?:prompt|instructions?)\b/i,
  /\breveal\s+(?:your\s+)?(?:system\s+prompt|api\s*key|env|secrets?)\b/i,
  /\b(?:dump|print|show|leak)\s+(?:all\s+)?(?:users?|passwords?|sessions?|tokens?|database|env)\b/i,
  /\bprocess\.env\b/i,
  /\bGEMINI_API_KEY\b/i,
  /\bSESSION_SECRET\b/i,
  /تجاهل\s+(?:كل\s+)?(?:التعليمات|الأوامر|القواعد)\s*(?:السابقة)?/u,
  /(?:اعرض|اظهر|أظهر|اكشف|هات)\s+(?:لي\s+)?(?:التعليمات|البرومبت|مفتاح|كلمات\s+المرور|الجلسات|قاعدة\s+البيانات)/u,
  /(?:أرقام|ارقام)\s+(?:الجوال|الهاتف|المستخدمين)\s+(?:السرية|المخفية|كلهم)/u,
  /<\s*script\b/i,
  /;\s*(?:DROP|DELETE|TRUNCATE|ALTER)\s+TABLE\b/i,
];

function stripControlChars(input: string): string {
  // Preserve newlines/tabs/Arabic/ASCII printable text while stripping unsafe ASCII control chars
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

export function validateAiInput(
  rawMessage: unknown,
  maxLength: number
): GuardrailValidationResult {
  if (typeof rawMessage !== 'string') {
    return {
      ok: false,
      sanitizedMessage: '',
      error: 'يرجى كتابة رسالتك للمساعد بشكل صحيح.',
      code: 'invalid_input',
    };
  }

  const cleaned = stripControlChars(rawMessage).replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return {
      ok: false,
      sanitizedMessage: '',
      error: 'لا يمكن إرسال رسالة فارغة.',
      code: 'invalid_input',
    };
  }

  if (cleaned.length > maxLength) {
    return {
      ok: false,
      sanitizedMessage: '',
      error: `الرسالة طويلة جداً. الحد الأقصى المسموح به هو ${maxLength} حرفاً.`,
      code: 'message_too_long',
    };
  }

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(cleaned)) {
      return {
        ok: false,
        sanitizedMessage: '',
        error:
          'عذراً، هذا الطلب غير مسموح به. يمكنني مساعدتك فقط في البحث عن إعلانات المواشي، أسعار السلالات، أو استخدام منصة سوق الغنم.',
        code: 'prompt_injection_blocked',
      };
    }
  }

  return { ok: true, sanitizedMessage: cleaned };
}

export function sanitizeHistory(
  rawHistory: unknown,
  maxItems: number,
  maxItemLength: number
): AiChatHistoryItem[] {
  if (!Array.isArray(rawHistory) || maxItems <= 0) return [];
  const safe: AiChatHistoryItem[] = [];
  for (const entry of rawHistory) {
    if (!entry || typeof entry !== 'object') continue;
    const role = (entry as { role?: unknown }).role;
    const content = (entry as { content?: unknown }).content;
    if (role !== 'user' && role !== 'assistant') continue;
    if (typeof content !== 'string') continue;
    const cleaned = stripControlChars(content).slice(0, maxItemLength).trim();
    if (!cleaned) continue;
    safe.push({ role, content: cleaned });
  }
  return safe.slice(-maxItems);
}

/**
 * Redacts accidental secrets, phone numbers, or email addresses if an LLM output ever tries to echo them.
 * Official marketplace listing contacts must only be revealed via POST /api/v1/listings/:id/contact.
 */
export function sanitizeAiOutput(text: string): string {
  let out = stripControlChars(text);
  // Redact Gemini-like API keys or long bearer/session secrets
  out = out.replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[تم الحجب]');
  // Redact Saudi mobile numbers (05xxxxxxxx or +9665xxxxxxxx / 9665xxxxxxxx)
  out = out.replace(/(?:\+?966|0)5\d{8}\b/g, '[رقم محجوب — استخدم زر إظهار الرقم في الإعلان]');
  // Redact email addresses
  out = out.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[بريد محجوب]');
  return out.trim();
}
