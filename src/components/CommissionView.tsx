import { useEffect, useMemo, useState } from 'react';
import {
  BadgePercent,
  Building2,
  Calculator,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Gift,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type {
  CommissionEligibility,
  CommissionRecord,
  CommissionSettings,
} from '../lib/commission';
import {
  calculateCommissionAmount,
  createDefaultCommissionSettings,
  formatIbanSpaced,
  getCommissionStatusMeta,
} from '../lib/commission';
import type { User } from '../types/marketplace';
import type { AuthMode, PageView } from '../lib/router';
import { formatPriceSar } from '../lib/format';
import { copyTextWithFallback } from '../lib/share';
import { api } from '../lib/api';
import { DynamicHeroBanner } from './DynamicHeroBanner';

interface CommissionViewProps {
  currentUser: User | null;
  commissionSettings?: CommissionSettings | null;
  commissionEligibility?: CommissionEligibility | null;
  myCommissionRecords?: CommissionRecord[];
  onNavigate: (page: PageView, options?: { authMode?: AuthMode }) => void;
  onRefreshData?: () => Promise<void>;
  onNotify?: (message: string) => void;
}

const EXAMPLE_AMOUNTS = [1500, 5000, 15000, 30000];

export function CommissionView({
  currentUser,
  commissionSettings,
  commissionEligibility,
  myCommissionRecords = [],
  onNavigate,
  onRefreshData,
  onNotify,
}: CommissionViewProps) {
  const settings = useMemo(
    () => commissionSettings || createDefaultCommissionSettings(),
    [commissionSettings]
  );

  const [saleAmountInput, setSaleAmountInput] = useState<string>('1500');
  const [copiedIban, setCopiedIban] = useState(false);

  const pendingOrRejectedRecords = useMemo(
    () =>
      myCommissionRecords.filter(
        (r) => r.status === 'pending_payment' || r.status === 'rejected'
      ),
    [myCommissionRecords]
  );

  const [selectedRecordId, setSelectedRecordId] = useState<string>(
    pendingOrRejectedRecords[0]?.id || 'direct'
  );
  const [transferReference, setTransferReference] = useState('');
  const [payerName, setPayerName] = useState(currentUser?.name || '');
  const [transferAmountInput, setTransferAmountInput] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  useEffect(() => {
    if (pendingOrRejectedRecords.length > 0 && selectedRecordId === 'direct') {
      const first = pendingOrRejectedRecords[0];
      setSelectedRecordId(first.id);
      setTransferAmountInput(String(first.commissionAmountSar || ''));
    }
  }, [pendingOrRejectedRecords, selectedRecordId]);

  useEffect(() => {
    if (selectedRecordId !== 'direct') {
      const target = myCommissionRecords.find((r) => r.id === selectedRecordId);
      if (target) {
        setTransferAmountInput(String(target.commissionAmountSar || ''));
      }
    }
  }, [selectedRecordId, myCommissionRecords]);

  const parsedCalcAmount = Number(saleAmountInput);
  const baseCommissionSar =
    Number.isFinite(parsedCalcAmount) && parsedCalcAmount > 0
      ? calculateCommissionAmount(parsedCalcAmount, settings.commissionRatePercent)
      : 0;
  const effectiveCommissionSar = commissionEligibility?.isExempt ? 0 : baseCommissionSar;

  const handleCopyIban = async () => {
    if (!settings.iban) return;
    const ok = await copyTextWithFallback(settings.iban);
    if (ok) {
      setCopiedIban(true);
      onNotify?.('تم نسخ رقم الآيبان بنجاح');
      window.setTimeout(() => setCopiedIban(false), 2200);
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || submitting) return;
    setSubmitError('');
    setSubmitSuccess('');

    const parsedAmount = Number(transferAmountInput);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setSubmitError('يرجى إدخال مبلغ الحوالة الصحيح بالريال السعودي');
      return;
    }
    if (transferReference.trim().length < 2) {
      setSubmitError('يرجى إدخال رقم مرجع الحوالة (حرفان على الأقل)');
      return;
    }
    if (payerName.trim().length < 2) {
      setSubmitError('يرجى إدخال اسم المحوّل (حرفان على الأقل)');
      return;
    }

    setSubmitting(true);
    try {
      await api.submitCommissionPayment({
        ...(selectedRecordId !== 'direct' ? { recordId: selectedRecordId } : {}),
        transferReference: transferReference.trim(),
        payerName: payerName.trim(),
        commissionAmountSar: parsedAmount,
        transferNote: transferNote.trim(),
      });
      setTransferReference('');
      setTransferNote('');
      setSubmitSuccess('تم إرسال نموذج تأكيد الحوالة بنجاح، وستتم مراجعته واعتماده من الإدارة.');
      onNotify?.('تم استلام تأكيد الحوالة بنجاح');
      await onRefreshData?.();
    } catch (err: any) {
      setSubmitError(err?.message || 'تعذر إرسال نموذج تأكيد الحوالة');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-[var(--color-canvas)] transition-colors">
      <DynamicHeroBanner
        pageKey="commission"
        variant="night-vault"
        eyebrow="النظام المعتمد في السوق السعودي — على البائع فقط بعد إتمام البيع"
        title={`عمولة الموقع (${settings.commissionRatePercent}%)`}
        titleAccent="وحاسبة السداد"
        subHeadline="تعتمد منصة سوق الغنم عمولة ميسّرة بعد إتمام البيعة عن طريق الموقع فقط، وتُعد أمانة في ذمة البائع مع وضوح تام في الحساب البنكي ورفع إيصال الحوالة."
          breadcrumbs={[
            { label: 'الرئيسية', onClick: () => onNavigate('home') },
            { label: 'نظام العمولة والسداد' },
          ]}
          contextLabel={
            commissionEligibility?.isExempt
              ? 'حسابك معفى حالياً (0%)'
              : `النسبة القياسية: ${settings.commissionRatePercent}%`
          }
          stats={[
            {
              label: 'نسبة العمولة',
              value: `${settings.commissionRatePercent}%`,
              accent: true,
            },
            {
              label: 'ميزة الإطلاق',
              value: settings.promoEnabled
                ? `أول ${settings.promoFreeDays} يوماً`
                : 'نسبة قياسية',
            },
            {
              label: 'تمييز الإعلان (اختياري)',
              value: formatPriceSar(settings.featuredWeeklyPriceSar),
            },
          ]}
          actions={
            currentUser && commissionEligibility ? (
              <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[#F4C569]/40 bg-white/[0.08] text-xs font-bold text-white">
                <ShieldCheck size={15} className="text-[#F4C569] shrink-0" aria-hidden="true" />
                <span>
                  {commissionEligibility.isExempt
                    ? 'حالة حسابك: معفى حالياً (0%)'
                    : `حالة حسابك: ${commissionEligibility.reasonLabel}`}
                </span>
              </div>
            ) : undefined
          }
          visual={
            <div className="flex flex-col justify-between h-full gap-3">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/15">
                <span className="text-xs font-extrabold text-white">
                  محاكي العمولة وصافي الربح
                </span>
                <span className="text-[11px] font-bold text-[#F4C569] tabular-nums">
                  {settings.commissionRatePercent}% من البيع
                </span>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.06] border border-white/15 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-emerald-100/80 tabular-nums">
                  <span>قيمة البيع المختارة</span>
                  <span className="font-bold text-white">
                    {Number.isFinite(parsedCalcAmount) && parsedCalcAmount > 0
                      ? formatPriceSar(parsedCalcAmount)
                      : '—'}
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="تحديد مبلغ البيع لحساب العمولة"
                  min={500}
                  max={50000}
                  step={250}
                  value={
                    Number.isFinite(parsedCalcAmount) && parsedCalcAmount >= 500
                      ? Math.min(50000, parsedCalcAmount)
                      : 1500
                  }
                  onChange={(e) => setSaleAmountInput(e.target.value)}
                  className="w-full accent-[#F4C569] cursor-pointer"
                />
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/15 tabular-nums">
                  <div>
                    <span className="block text-[10px] text-emerald-100/75">العمولة المستحقة</span>
                    <span className="font-display text-lg font-extrabold text-[#F4C569]">
                      {formatPriceSar(effectiveCommissionSar)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-emerald-100/75">صافي البائع</span>
                    <span className="font-display text-lg font-extrabold text-white">
                      {Number.isFinite(parsedCalcAmount) && parsedCalcAmount > 0
                        ? formatPriceSar(Math.max(0, parsedCalcAmount - effectiveCommissionSar))
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {EXAMPLE_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setSaleAmountInput(String(amt))}
                    className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-[11px] font-bold tabular-nums transition-colors cursor-pointer ${
                      Number(saleAmountInput) === amt
                        ? 'bg-[#F4C569] text-[#0B231A] border-[#F4C569]'
                        : 'bg-white/[0.06] border-white/15 text-emerald-100/85 hover:border-[#F4C569]/60'
                    }`}
                  >
                    {amt.toLocaleString('en-US')} ر.س
                  </button>
                ))}
              </div>
            </div>
          }
          interactiveDock={
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-emerald-100/80 font-semibold">
                انتقال سريع داخل صفحة السداد:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href="#commission-bank-card"
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-white/[0.08] border border-white/20 hover:border-[#F4C569] text-white font-bold inline-flex items-center gap-1.5"
                >
                  <Building2 size={13} aria-hidden="true" />
                  <span>الحساب البنكي والآيبان</span>
                </a>
                <a
                  href="#commission-transfer-form"
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-[#F4C569] hover:bg-[#ffd582] text-[#0B231A] font-extrabold inline-flex items-center gap-1.5"
                >
                  <CreditCard size={13} aria-hidden="true" />
                  <span>رفع تأكيد الحوالة</span>
                </a>
              </div>
            </div>
          }
        />

      {/* Main Content */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Interactive Calculator */}
          <div className="lg:col-span-6 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 space-y-5">
            <div className="flex items-center gap-2.5 pb-3 border-b border-[var(--color-border)]">
              <Calculator size={20} className="text-[var(--color-green-ink)]" aria-hidden="true" />
              <div>
                <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
                  حاسبة العمولة الفورية
                </h2>
                <p className="text-xs text-[var(--color-muted)]">
                  احسب عمولة المنصة لأي صفقة بيع بالريال السعودي
                </p>
              </div>
            </div>

            <div>
              <label
                htmlFor="commission-calc-amount"
                className="block text-xs font-bold text-[var(--color-ink)] mb-1.5"
              >
                سعر البيع الإجمالي (ر.س)
              </label>
              <input
                id="commission-calc-amount"
                type="number"
                min={0}
                step="any"
                value={saleAmountInput}
                onChange={(e) => setSaleAmountInput(e.target.value)}
                className="w-full h-12 px-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/40 text-base font-extrabold text-[var(--color-ink)] tabular-nums focus:outline-none focus:border-[var(--color-green-ink)]"
              />
              <div className="mt-2.5 flex flex-wrap gap-2">
                {EXAMPLE_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setSaleAmountInput(String(amt))}
                    className={`min-h-[36px] px-3 py-1 rounded-lg border text-xs font-semibold tabular-nums cursor-pointer transition-colors ${
                      Number(saleAmountInput) === amt
                        ? 'bg-[var(--color-green)] text-white border-[var(--color-green)]'
                        : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-ink)] hover:bg-[var(--color-cream)]'
                    }`}
                  >
                    {formatPriceSar(amt)}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/70 p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-[var(--color-muted)]">العمولة القياسية ({settings.commissionRatePercent}%):</span>
                <span className="font-display text-xl font-extrabold text-[var(--color-green-ink)] tabular-nums">
                  {formatPriceSar(baseCommissionSar)}
                </span>
              </div>
              {commissionEligibility?.isExempt && (
                <div className="pt-2 border-t border-[var(--color-border)] flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-[var(--color-green-ink)]">
                    المستحق عليك الآن (ضمن عرض الإطلاق):
                  </span>
                  <span className="font-extrabold text-[var(--color-green-ink)] tabular-nums">
                    {formatPriceSar(effectiveCommissionSar)}
                  </span>
                </div>
              )}
            </div>

            {/* 3-Step Accountability Explanation */}
            <div className="pt-2 space-y-2.5">
              <h3 className="font-display text-sm font-bold text-[var(--color-ink)]">
                كيف يضبط الموقع عملية العمولة بعد البيع؟
              </h3>
              <ul className="space-y-2 text-xs text-[var(--color-muted)] leading-relaxed">
                <li className="flex items-start gap-2">
                  <CheckCircle2
                    size={15}
                    className="text-[var(--color-green-ink)] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>
                    <strong className="text-[var(--color-ink)]">إقرار الأمانة:</strong> يوافق البائع قبل نشر إعلانه على أن عمولة {settings.commissionRatePercent}% أمانة في ذمته إذا تم البيع عن طريق المنصة.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2
                    size={15}
                    className="text-[var(--color-green-ink)] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>
                    <strong className="text-[var(--color-ink)]">عند إغلاق الإعلان أو تحديده كمباع:</strong> يسأل الموقع البائع «هل تم البيع عن طريق الموقع؟» ويحسب العمولة تلقائياً عند إدخال مبلغ البيع.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2
                    size={15}
                    className="text-[var(--color-green-ink)] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>
                    <strong className="text-[var(--color-ink)]">تأكيد الحوالة وإشعار الإدارة:</strong> يرسل البائع مرجع الحوالة عبر النموذج ويصل إشعار فوري للإدارة لاعتماد السداد.
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* Bank Details & Transfer Confirmation Form */}
          <div className="lg:col-span-6 space-y-6">
            {/* Platform Bank Details */}
            <div
              id="commission-bank-card"
              className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 space-y-4"
            >
              <div className="flex items-center gap-2.5 pb-3 border-b border-[var(--color-border)]">
                <Building2 size={20} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                <div>
                  <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
                    الحساب البنكي الرسمي للمنصة
                  </h2>
                  <p className="text-xs text-[var(--color-muted)]">
                    يُستخدم الآيبان لتحويل العمولة بعد البيع أو رسوم تمييز الإعلان
                  </p>
                </div>
              </div>

              {settings.iban ? (
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-[var(--color-cream)]/60 border border-[var(--color-border)]">
                      <p className="text-[var(--color-muted)]">اسم البنك</p>
                      <p className="font-bold text-[var(--color-ink)] mt-0.5">
                        {settings.bankName || 'سيُحدد من الإدارة'}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-[var(--color-cream)]/60 border border-[var(--color-border)]">
                      <p className="text-[var(--color-muted)]">اسم صاحب الحساب</p>
                      <p className="font-bold text-[var(--color-ink)] mt-0.5">
                        {settings.accountHolderName || 'إدارة منصة سوق الغنم'}
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] text-[var(--color-muted)]">رقم الآيبان (IBAN)</p>
                      <p
                        dir="ltr"
                        className="font-mono text-sm font-extrabold text-[var(--color-ink)] tabular-nums mt-0.5"
                      >
                        {formatIbanSpaced(settings.iban)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyIban}
                      className="min-h-[40px] px-3.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-green-ink)] text-xs font-bold text-[var(--color-green-ink)] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedIban ? (
                        <Check size={14} aria-hidden="true" />
                      ) : (
                        <Copy size={14} aria-hidden="true" />
                      )}
                      <span>{copiedIban ? 'تم النسخ' : 'نسخ الآيبان'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[var(--color-muted)] leading-relaxed p-3.5 rounded-xl bg-[var(--color-cream)]/50 border border-[var(--color-border)]">
                  لم تُضف بيانات الآيبان البنكي من مالك الموقع بعد. بمجرد إدخال الآيبان في لوحة الإدارة سيظهر هنا وفي نموذج تأكيد الحوالة تلقائياً.
                </p>
              )}
            </div>

            {/* Transfer Confirmation Form */}
            <div
              id="commission-transfer-form"
              className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 space-y-4"
            >
              <div className="flex items-center gap-2.5 pb-3 border-b border-[var(--color-border)]">
                <CreditCard size={20} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                <div>
                  <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
                    نموذج تأكيد الحوالة البنكية
                  </h2>
                  <p className="text-xs text-[var(--color-muted)]">
                    بعد التحويل، أرسل بيانات الحوالة لتأكيد سداد العمولة أو رسوم التمييز
                  </p>
                </div>
              </div>

              {!currentUser ? (
                <div className="space-y-3 py-2">
                  <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                    سجّل الدخول إلى حسابك لإرسال تأكيد الحوالة وربطه بإعلاناتك أو سجل المبيعات.
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('login', { authMode: 'login' })}
                    className="min-h-[44px] px-5 py-2 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs sm:text-sm font-bold cursor-pointer"
                  >
                    تسجيل الدخول لتأكيد الحوالة
                  </button>
                </div>
              ) : (
                <form onSubmit={handleTransferSubmit} className="space-y-3.5">
                  {submitError && (
                    <p
                      role="alert"
                      className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
                    >
                      {submitError}
                    </p>
                  )}
                  {submitSuccess && (
                    <p
                      role="status"
                      className="p-3 rounded-xl bg-[var(--color-cream)] border border-[var(--color-green-ink)]/30 text-xs font-semibold text-[var(--color-green-ink)]"
                    >
                      {submitSuccess}
                    </p>
                  )}

                  {pendingOrRejectedRecords.length > 0 && (
                    <div>
                      <label
                        htmlFor="comm-page-record"
                        className="block text-xs font-semibold text-[var(--color-ink)] mb-1"
                      >
                        اختر العملية المستحقة
                      </label>
                      <select
                        id="comm-page-record"
                        value={selectedRecordId}
                        onChange={(e) => setSelectedRecordId(e.target.value)}
                        className="w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                      >
                        {pendingOrRejectedRecords.map((rec) => {
                          const meta = getCommissionStatusMeta(rec.status);
                          return (
                            <option key={rec.id} value={rec.id}>
                              {rec.listingTitle} — {formatPriceSar(rec.commissionAmountSar)} ({meta.label})
                            </option>
                          );
                        })}
                        <option value="direct">سداد مباشر لحوالة عمولة عامة</option>
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="comm-page-ref"
                        className="block text-xs font-semibold text-[var(--color-ink)] mb-1"
                      >
                        رقم مرجع الحوالة
                      </label>
                      <input
                        id="comm-page-ref"
                        type="text"
                        value={transferReference}
                        onChange={(e) => setTransferReference(e.target.value)}
                        placeholder="مثال: TRF-99124"
                        className="w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="comm-page-payer"
                        className="block text-xs font-semibold text-[var(--color-ink)] mb-1"
                      >
                        اسم المحوّل
                      </label>
                      <input
                        id="comm-page-payer"
                        type="text"
                        value={payerName}
                        onChange={(e) => setPayerName(e.target.value)}
                        placeholder="اسم صاحب الحساب البنكي"
                        className="w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="comm-page-amount"
                        className="block text-xs font-semibold text-[var(--color-ink)] mb-1"
                      >
                        مبلغ الحوالة (ريال سعودي)
                      </label>
                      <input
                        id="comm-page-amount"
                        type="number"
                        min={1}
                        step="any"
                        required
                        value={transferAmountInput}
                        onChange={(e) => setTransferAmountInput(e.target.value)}
                        placeholder={String(Math.max(15, Math.round(baseCommissionSar) || 15))}
                        className="w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-bold text-[var(--color-ink)] tabular-nums focus:outline-none focus:border-[var(--color-green-ink)]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="comm-page-note"
                        className="block text-xs font-semibold text-[var(--color-ink)] mb-1"
                      >
                        ملاحظات إضافية (اختياري)
                      </label>
                      <input
                        id="comm-page-note"
                        type="text"
                        value={transferNote}
                        onChange={(e) => setTransferNote(e.target.value)}
                        placeholder="البنك المحوّل منه أو رقم الإعلان..."
                        className="w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {submitting ? (
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 size={16} aria-hidden="true" />
                    )}
                    <span>{submitting ? 'جاري الإرسال...' : 'إرسال تأكيد الحوالة للمراجعة'}</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
