const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EXT_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';

export function toAsciiDigitsClient(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (ch) => {
    const a = ARABIC_INDIC.indexOf(ch);
    if (a !== -1) return String(a);
    return String(EXT_ARABIC_INDIC.indexOf(ch));
  });
}

/**
 * Normalizes a Saudi mobile number to 05XXXXXXXX using the exact same rules
 * as server/auth/phone.ts (Arabic/English digits, optional +966 / 00966 / 966 / 5...).
 */
export function normalizeSaudiMobileClient(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 32) return null;
  let s = toAsciiDigitsClient(input).replace(/[\s\-().]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('00')) s = s.slice(2);
  if (s.startsWith('966')) s = s.slice(3);
  if (/^5\d{8}$/.test(s)) s = `0${s}`;
  return /^05\d{8}$/.test(s) ? s : null;
}

const COMMON_PASSWORDS = new Set([
  'password12',
  'password123',
  '1234567890',
  '12345678910',
  '0123456789',
  'qwertyuiop',
  'iloveyou12',
  '0500000000',
  '0555555555',
  'abcdefghij',
  'passw0rd123',
  'admin12345',
  'welcome123',
  'letmein123',
]);

/**
 * Mirrors server/auth/phone.ts password validation rules on the client
 * so users receive immediate, accurate feedback before submission.
 */
export function validatePasswordClient(
  password: unknown,
  normalizedPhone?: string | null
): string | null {
  if (typeof password !== 'string') {
    return 'كلمة المرور مطلوبة';
  }
  const length = [...password].length;
  if (length < 10) return 'كلمة المرور يجب ألا تقل عن 10 أحرف';
  if (length > 128) return 'كلمة المرور طويلة جداً (الحد الأقصى 128 حرفاً)';
  if (/^(.)\1+$/u.test(password)) return 'كلمة المرور ضعيفة جداً';
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'كلمة المرور شائعة وسهلة التخمين';
  }
  if (
    normalizedPhone &&
    (password === normalizedPhone || toAsciiDigitsClient(password) === normalizedPhone)
  ) {
    return 'لا يمكن أن تكون كلمة المرور هي رقم الجوال';
  }
  return null;
}
