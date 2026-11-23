import { useEffect, useMemo, useState } from 'react';
import {
  BadgePercent,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Loader2,
  ShieldCheck,
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
} from '../lib/commission';
import type { Listing } from '../types/marketplace';
import { formatPriceSar } from '../lib/format';
import { copyTextWithFallback } from '../lib/share';
import { api } from '../lib/api';
import { Modal } from './Modal';

interface MarkSoldModalProps {
  open: boolean;
  onClose: () => void;
  listing: Listing | null;
  commissionSettings?: CommissionSettings | null;
  commissionEligibility?: CommissionEligibility | null;
  onSoldComplete?: (result: {
    listing: Listing;
    commissionRecord: CommissionRecord;
    eligibility: CommissionEligibility;
  }) => Promise<void> | void;
  onTransferSubmitted?: (record: CommissionRecord) => Promise<void> | void;
  onNotify?: (message: string) => void;
}

export function MarkSoldModal({
  open,
  onClose,
  listing,
  commissionSettings,
  commissionEligibility,
  onSoldComplete,
  onTransferSubmitted,
  onNotify,
}: MarkSoldModalProps) {
  const settings = useMemo(
    () => commissionSettings || createDefaultCommissionSettings(),
    [commissionSettings]
  );

  const [step, setStep] = useState<'question' | 'transfer'>('question');
  const [soldViaPlatform, setSoldViaPlatform] = useState<boolean>(true);
  const [saleAmountInput, setSaleAmountInput] = useState<string>('');
  const [submittingSold, setSubmittingSold] = useState(false);
  const [soldError, setSoldError] = useState('');

  const [createdRecord, setCreatedRecord] = useState<CommissionRecord | null>(null);
  const [transferReference, setTransferReference] = useState('');
  const [payerName, setPayerName] = useState('');
  const [transferAmountInput, setTransferAmountInput] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [copiedIban, setCopiedIban] = useState(false);

  useEffect(() => {
    if (!open || !listing) return;
    const defaultTotal = Math.max(
      1,
      Math.round(Number(listing.priceAmount || 0) * Math.max(1, Number(listing.quantity || 1)))
    );
    setStep('question');
    setSoldViaPlatform(true);
    setSaleAmountInput(String(defaultTotal));
    setSubmittingSold(false);
    setSoldError('');
    setCreatedRecord(null);
    setTransferReference('');
    setPayerName('');
    setTransferAmountInput('');
    setTransferNote('');
    setSubmittingTransfer(false);
    setTransferError('');
    setCopiedIban(false);
  }, [open, listing]);

  const parsedSaleAmount = Number(saleAmountInput);
  const isExempt = Boolean(commissionEligibility?.isExempt);
  const effectiveRate = isExempt ? 0 : settings.commissionRatePercent;
  const previewCommissionSar =
    soldViaPlatform && Number.isFinite(parsedSaleAmount) && parsedSaleAmount > 0
      ? calculateCommissionAmount(parsedSaleAmount, effectiveRate)
      : 0;

  const handleConfirmMarkSold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listing || submittingSold) return;
    setSoldError('');

    if (soldViaPlatform && (!Number.isFinite(parsedSaleAmount) || parsedSaleAmount <= 0)) {
      setSoldError('يرجى إدخال مبلغ البيع الفعلي بالريال السعودي (أكبر من صفر)');
      return;
    }

    setSubmittingSold(true);
    try {
      const res = await api.markListingSold(listing.id, {
        soldViaPlatform,
        ...(soldViaPlatform ? { saleAmountSar: parsedSaleAmount } : {}),
      });
      await onSoldComplete?.(res);

      if (res.commissionRecord.status === 'pending_payment' && res.commissionRecord.commissionAmountSar > 0) {
        setCreatedRecord(res.commissionRecord);
        setTransferAmountInput(String(res.commissionRecord.commissionAmountSar));
        setStep('transfer');
        onNotify?.('تم تحديد الإعلان كمباع. يمكنك الآن إرسال بيانات حوالة العمولة.');
      } else if (res.commissionRecord.isExempt) {
        onNotify?.('تم إغلاق الإعلان كمباع بنجاح (معفى من العمولة ضمن عرض الإطلاق)');
        onClose();
      } else {
        onNotify?.('تم تحديد الإعلان كمباع وإغلاقه بنجاح');
        onClose();
      }
    } catch (err: any) {
      setSoldError(err?.message || 'تعذر تحديث حالة الإعلان إلى مباع');
    } finally {
      setSubmittingSold(false);
    }
  };

  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createdRecord || submittingTransfer) return;
    setTransferError('');

    const parsedTransfer = Number(transferAmountInput);
    if (!Number.isFinite(parsedTransfer) || parsedTransfer <= 0) {
      setTransferError('يرجى إدخال مبلغ الحوالة الصحيح بالريال السعودي');
      return;
    }
    if (transferReference.trim().length < 2) {
      setTransferError('يرجى إدخال رقم مرجع الحوالة (حرفان على الأقل)');
      return;
    }
    if (payerName.trim().length < 2) {
      setTransferError('يرجى إدخال اسم صاحب الحساب المحوّل (حرفان على الأقل)');
      return;
    }

    setSubmittingTransfer(true);
    try {
      const res = await api.submitCommissionPayment({
        recordId: createdRecord.id,
        transferReference: transferReference.trim(),
        payerName: payerName.trim(),
        commissionAmountSar: parsedTransfer,
        transferNote: transferNote.trim(),
      });
      await onTransferSubmitted?.(res.commissionRecord);
      onNotify?.('تم إرسال بيانات الحوالة بنجاح، وستراجعها الإدارة وتعتمدها قريباً');
      onClose();
    } catch (err: any) {
      setTransferError(err?.message || 'تعذر إرسال بيانات الحوالة');
    } finally {
      setSubmittingTransfer(false);
    }
  };

  const handleCopyIban = async () => {
    if (!settings.iban) return;
    const ok = await copyTextWithFallback(settings.iban);
    if (ok) {
      setCopiedIban(true);
      window.setTimeout(() => setCopiedIban(false), 2200);
    }
  };

  if (!listing) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === 'question' ? 'تحديد الإعلان كمباع' : 'تأكيد حوالة عمولة الموقع'}
      subtitle={listing.title}
      size="lg"
    >
      {step === 'question' ? (
        <form onSubmit={handleConfirmMarkSold} className="space-y-5">
          {soldError && (
            <p
              role="alert"
              className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
            >
              {soldError}
            </p>
          )}

          <div className="space-y-2.5">
            <p className="font-display text-base font-bold text-[var(--color-ink)]">
              هل تم البيع عبر المنصة؟
            </p>
            <p className="text-xs text-[var(--color-muted)] leading-relaxed">
              تُحسب عمولة المنصة ({settings.commissionRatePercent}%) على البائع فقط في حال تم البيع عبر المنصة وبعد إتمام البيع، وبإمكانك إغلاق الإعلان دون عمولة إذا تم البيع خارجها.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setSoldViaPlatform(true)}
                aria-pressed={soldViaPlatform}
                className={`min-h-[54px] p-3.5 rounded-xl border text-right transition-colors cursor-pointer ${
                  soldViaPlatform
                    ? 'border-[var(--color-green-ink)] bg-[var(--color-cream)] ring-2 ring-[var(--color-green-ink)]/20'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)]/40'
                }`}
              >
                <p className="text-sm font-bold text-[var(--color-green-ink)]">
                  نعم، تم البيع عبر المنصة
                </p>
                <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                  أدخل مبلغ البيع لحساب العمولة تلقائياً وإبراء الذمة
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSoldViaPlatform(false)}
                aria-pressed={!soldViaPlatform}
                className={`min-h-[54px] p-3.5 rounded-xl border text-right transition-colors cursor-pointer ${
                  !soldViaPlatform
                    ? 'border-[var(--color-green-ink)] bg-[var(--color-cream)] ring-2 ring-[var(--color-green-ink)]/20'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)]/40'
                }`}
              >
                <p className="text-sm font-bold text-[var(--color-ink)]">
                  لا، تم البيع خارج المنصة
                </p>
                <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                  إغلاق الإعلان كمباع دون استحقاق عمولة على المنصة
                </p>
              </button>
            </div>
          </div>

          {soldViaPlatform && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/45 p-4 space-y-4">
              <div>
                <label
                  htmlFor="mark-sold-sale-amount"
                  className="block text-xs font-bold text-[var(--color-ink)] mb-1.5"
                >
                  مبلغ البيع الإجمالي الفعلي (بالريال السعودي)
                </label>
                <input
                  id="mark-sold-sale-amount"
                  type="number"
                  min={1}
                  step="any"
                  required={soldViaPlatform}
                  value={saleAmountInput}
                  onChange={(e) => setSaleAmountInput(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-bold text-[var(--color-ink)] tabular-nums focus:outline-none focus:border-[var(--color-green-ink)]"
                />
              </div>

              {isExempt ? (
                <div className="rounded-xl border border-[var(--color-green-ink)]/30 bg-[var(--color-surface)] p-3.5 flex items-start gap-2.5">
                  <ShieldCheck
                    size={18}
                    className="text-[var(--color-green-ink)] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="space-y-0.5 text-xs">
                    <p className="font-bold text-[var(--color-green-ink)]">
                      عمولة هذه البيعة: 0 ر.س (إعفاء تشجيعي وقت الإطلاق)
                    </p>
                    <p className="text-[var(--color-muted)] leading-relaxed">
                      {commissionEligibility?.reasonLabel}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-[var(--color-gold)]/50 bg-[var(--color-surface)] p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-[var(--color-ink)]">
                    <BadgePercent
                      size={18}
                      className="text-[var(--color-green-ink)] shrink-0"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="font-bold">
                        عمولة الموقع ({settings.commissionRatePercent}%)
                      </p>
                      <p className="text-[11px] text-[var(--color-muted)]">
                        بعد تأكيد البيع سيظهر لك نموذج إرسال الحوالة
                      </p>
                    </div>
                  </div>
                  <p className="font-display text-lg font-extrabold text-[var(--color-green-ink)] tabular-nums">
                    {formatPriceSar(previewCommissionSar)}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={submittingSold}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--color-border)] text-xs sm:text-sm font-semibold text-[var(--color-muted)] hover:bg-[var(--color-cream)] cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submittingSold}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {submittingSold ? (
                <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 size={15} aria-hidden="true" />
              )}
              <span>
                {submittingSold
                  ? 'جاري التحديث...'
                  : soldViaPlatform
                  ? 'تأكيد البيع والمتابعة'
                  : 'إغلاق الإعلان كمباع'}
              </span>
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleSubmitTransfer} className="space-y-4">
          <div className="rounded-xl border border-[var(--color-green-ink)]/30 bg-[var(--color-cream)] p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-[var(--color-green-ink)] font-bold">
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>تم تحديد الإعلان كمباع وإشعار الإدارة بنجاح</span>
            </div>
            <span className="font-display text-sm font-extrabold text-[var(--color-ink)] tabular-nums">
              العمولة المستحقة: {formatPriceSar(createdRecord?.commissionAmountSar ?? 0)}
            </span>
          </div>

          {/* Platform Bank Details */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-ink)]">
              <Building2 size={15} className="text-[var(--color-green-ink)]" aria-hidden="true" />
              <span>بيانات الحساب البنكي لتحويل العمولة</span>
            </div>

            {settings.iban ? (
              <div className="space-y-2 text-xs">
                {settings.bankName && (
                  <p className="text-[var(--color-muted)]">
                    البنك: <span className="font-bold text-[var(--color-ink)]">{settings.bankName}</span>
                  </p>
                )}
                {settings.accountHolderName && (
                  <p className="text-[var(--color-muted)]">
                    اسم صاحب الحساب:{' '}
                    <span className="font-bold text-[var(--color-ink)]">
                      {settings.accountHolderName}
                    </span>
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]/60 px-3 py-2">
                  <span dir="ltr" className="font-mono text-xs font-bold text-[var(--color-ink)] tabular-nums">
                    {formatIbanSpaced(settings.iban)}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyIban}
                    className="min-h-[36px] px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] text-xs font-semibold text-[var(--color-green-ink)] inline-flex items-center gap-1 cursor-pointer"
                  >
                    {copiedIban ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                    <span>{copiedIban ? 'تم نسخ الآيبان' : 'نسخ الآيبان'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                سيتم تزويدك برقم الآيبان الرسمي عند إضافته من الإدارة، ويمكنك تأكيد الحوالة لاحقاً من سجل العمولة في لوحة حسابي.
              </p>
            )}
          </div>

          {transferError && (
            <p
              role="alert"
              className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
            >
              {transferError}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="modal-transfer-ref"
                className="block text-xs font-semibold text-[var(--color-ink)] mb-1"
              >
                رقم مرجع الحوالة
              </label>
              <input
                id="modal-transfer-ref"
                type="text"
                value={transferReference}
                onChange={(e) => setTransferReference(e.target.value)}
                placeholder="مثال: TRF-884210"
                className="w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
              />
            </div>

            <div>
              <label
                htmlFor="modal-transfer-payer"
                className="block text-xs font-semibold text-[var(--color-ink)] mb-1"
              >
                اسم صاحب الحساب المحوّل
              </label>
              <input
                id="modal-transfer-payer"
                type="text"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                placeholder="الاسم الثلاثي كما يظهر في البنك"
                className="w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="modal-transfer-amount"
                className="block text-xs font-semibold text-[var(--color-ink)] mb-1"
              >
                مبلغ الحوالة (ريال سعودي)
              </label>
              <input
                id="modal-transfer-amount"
                type="number"
                min={1}
                step="any"
                required
                value={transferAmountInput}
                onChange={(e) => setTransferAmountInput(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-bold text-[var(--color-ink)] tabular-nums focus:outline-none focus:border-[var(--color-green-ink)]"
              />
            </div>

            <div>
              <label
                htmlFor="modal-transfer-note"
                className="block text-xs font-semibold text-[var(--color-ink)] mb-1"
              >
                ملاحظة إضافية (اختياري)
              </label>
              <input
                id="modal-transfer-note"
                type="text"
                value={transferNote}
                onChange={(e) => setTransferNote(e.target.value)}
                placeholder="مثال: تحويل مصرف الراجحي"
                className="w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={submittingTransfer}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--color-border)] text-xs sm:text-sm font-semibold text-[var(--color-muted)] hover:bg-[var(--color-cream)] cursor-pointer"
            >
              الدفع لاحقاً من لوحة حسابي
            </button>
            <button
              type="submit"
              disabled={submittingTransfer}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {submittingTransfer ? (
                <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              ) : (
                <CreditCard size={15} aria-hidden="true" />
              )}
              <span>{submittingTransfer ? 'جاري الإرسال...' : 'إرسال تأكيد الحوالة'}</span>
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
