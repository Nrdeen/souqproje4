const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EXT_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';

function toAsciiDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (ch) => {
    const a = ARABIC_INDIC.indexOf(ch);
    if (a !== -1) return String(a);
    return String(EXT_ARABIC_INDIC.indexOf(ch));
  });
}

/**
 * Normalises a Saudi mobile number to the local form 05XXXXXXXX that the existing
 * data already uses. Returns null when the input is not a valid Saudi mobile number.
 */
export function normalizeSaudiMobile(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 32) return null;
  let s = toAsciiDigits(input).replace(/[\s\-().]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('00')) s = s.slice(2);
  if (s.startsWith('966')) s = s.slice(3);
  if (/^5\d{8}$/.test(s)) s = `0${s}`;
  return /^05\d{8}$/.test(s) ? s : null;
}

const COMMON = new Set([
  'password12', 'password123', '1234567890', '12345678910', '0123456789', 'qwertyuiop', 'iloveyou12',
  '0500000000', '0555555555', 'abcdefghij', 'passw0rd123', 'admin12345', 'welcome123', 'letmein123',
]);

export function validatePassword(password: unknown, phone?: string): string | null {
  if (typeof password !== 'string') return 'كلمة المرور مطلوبة';
  const length = [...password].length;
  if (length < 10) return 'كلمة المرور يجب ألا تقل عن 10 أحرف';
  if (length > 128) return 'كلمة المرور طويلة جداً (الحد الأقصى 128 حرفاً)';
  if (/^(.)\1+$/u.test(password)) return 'كلمة المرور ضعيفة جداً';
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return 'كلمة المرور شائعة وسهلة التخمين';
  if (phone && (password === phone || toAsciiDigits(password) === phone)) {
    return 'لا يمكن أن تكون كلمة المرور هي رقم الجوال';
  }
  return null;
}
