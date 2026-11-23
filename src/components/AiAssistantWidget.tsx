import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  CheckCheck,
  Headset,
  HelpCircle,
  PlusSquare,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Smile,
  User,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatPriceSar } from '../lib/format';
import type { PageView } from '../lib/router';
import type { AiChatHistoryItem, AiListingCard, AiUsageSnapshot } from '../types/marketplace';
import { SafeImage } from './SafeImage';

const MASCOT_IMAGE_URL = '/src/assets/images/saudi_sheep_mascot_1795032601503.jpg';

interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timeLabel: string;
  cards?: AiListingCard[];
  suggestedFollowUps?: string[];
  isError?: boolean;
  retryPrompt?: string;
}

interface AiAssistantWidgetProps {
  onSelectListing: (listingId: string) => void;
  onNavigate?: (page: PageView) => void;
  userId?: string | null;
  offsetForBottomBar?: boolean | 'nav' | 'detail';
}

function formatCurrentTimeLabel(): string {
  try {
    return new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '12:00';
  }
}

/**
 * Gold 4-point AI star mark used inside the minimalist circular launcher.
 */
function SaudiMinimalAiMark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M11.5 3C12.35 7.95 15.05 10.65 20 11.5C15.05 12.35 12.35 15.05 11.5 20C10.65 15.05 7.95 12.35 3 11.5C7.95 10.65 10.65 7.95 11.5 3Z"
        fill="currentColor"
      />
      <path
        d="M18.5 15.5C18.85 17.2 19.8 18.15 21.5 18.5C19.8 18.85 18.85 19.8 18.5 21.5C18.15 19.8 17.2 18.85 15.5 18.5C17.2 18.15 18.15 17.2 18.5 15.5Z"
        fill="currentColor"
        fillOpacity="0.85"
      />
    </svg>
  );
}

/**
 * Friendly emerald-and-gold circular robot avatar displayed beside assistant replies.
 */
function SaudiBotAvatar({ className = 'w-9 h-9' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`${className} rounded-full bg-[#0B3A29] border border-[#D6AC58] text-[#D6AC58] flex items-center justify-center shrink-0 shadow-sm`}
    >
      <svg viewBox="0 0 28 28" fill="none" className="w-5 h-5">
        <line x1="14" y1="3.5" x2="14" y2="6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="14" cy="3" r="1.4" fill="currentColor" />
        <rect
          x="6.5"
          y="7"
          width="15"
          height="11.5"
          rx="4.2"
          stroke="currentColor"
          strokeWidth="1.8"
          fill="#0E4431"
        />
        <circle cx="11" cy="12.2" r="1.3" fill="currentColor" />
        <circle cx="17" cy="12.2" r="1.3" fill="currentColor" />
        <path
          d="M11.2 15.3C12.2 16.2 15.8 16.2 16.8 15.3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M9.5 21C10.8 19.5 17.2 19.5 18.5 21"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/**
 * Subtle gold sheep divider centered beneath assistant message text.
 */
function SheepBubbleDivider() {
  return (
    <div className="mt-2.5 flex items-center justify-center gap-2.5" aria-hidden="true">
      <span className="h-[1px] flex-1 bg-gradient-to-l from-[#DFBA68]/75 to-transparent" />
      <svg viewBox="0 0 24 18" fill="none" className="w-4 h-3.5 text-[#C59328] shrink-0">
        <path
          d="M6.5 12.5V15.5M10 12.8V15.5M14.5 12.8V15.5M17.5 12V15.5"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <path
          d="M6 12C4.2 11.7 3.5 9.8 4.4 8.3C4.1 6.7 5.6 5.2 7.4 5.5C8.5 4.2 11 4.2 12.3 5.4C13.9 4.7 16 5.4 16.7 7C18 6.8 19.5 7.7 19.8 9C20.2 10.6 18.9 12.2 17.2 12.3H6Z"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinejoin="round"
        />
        <circle cx="18.2" cy="8.7" r="0.65" fill="currentColor" />
      </svg>
      <span className="h-[1px] flex-1 bg-gradient-to-r from-[#DFBA68]/75 to-transparent" />
    </div>
  );
}

export function AiAssistantWidget({
  onSelectListing,
  onNavigate,
  userId,
  offsetForBottomBar = false,
}: AiAssistantWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [maxMessageLength, setMaxMessageLength] = useState(600);
  const [usage, setUsage] = useState<AiUsageSnapshot | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [mobileViewportHeight, setMobileViewportHeight] = useState<number | null>(null);

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const status = await api.getAiStatus();
      setEnabled(status.enabled);
      setMaxMessageLength(status.maxMessageLength || 600);
      setUsage(status.usage);
    } catch {
      // Keep default widget readiness if status check fails transiently
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void fetchStatus();
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [open, userId, fetchStatus]);

  useEffect(() => {
    if (!open || messages.length === 0) return;
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, open, sending]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        launcherRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Lock page scroll on mobile while full-viewport AI workspace is open
  useEffect(() => {
    if (!open || window.innerWidth >= 640) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Sync height with mobile soft keyboard viewport
  useEffect(() => {
    if (!open || window.innerWidth >= 640 || !window.visualViewport) {
      setMobileViewportHeight(null);
      return;
    }
    const vv = window.visualViewport;
    const syncHeight = () => {
      setMobileViewportHeight(vv.height);
    };
    syncHeight();
    vv.addEventListener('resize', syncHeight);
    return () => {
      vv.removeEventListener('resize', syncHeight);
      setMobileViewportHeight(null);
    };
  }, [open]);

  // Auto-resize composer cleanly up to ~3 lines
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 84)}px`;
  }, [input, open]);

  const sendMessage = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessageItem = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: trimmed,
      timeLabel: formatCurrentTimeLabel(),
    };

    const history: AiChatHistoryItem[] = messages
      .filter((m) => !m.isError)
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await api.sendAiChat({ message: trimmed, history });
      setUsage(res.usage);
      setMessages((prev) => [
        ...prev,
        {
          id: `ai_${Date.now()}`,
          role: 'assistant',
          content: res.reply,
          timeLabel: formatCurrentTimeLabel(),
          cards: res.cards,
          suggestedFollowUps: res.suggestedFollowUps,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: err?.message || 'تعذر الحصول على رد الآن، يرجى المحاولة بعد لحظات.',
          timeLabel: formatCurrentTimeLabel(),
          isError: true,
          retryPrompt: trimmed,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const handleCardClick = (listingId: string) => {
    onSelectListing(listingId);
    if (window.innerWidth < 640) {
      setOpen(false);
    }
  };

  const handleRouteAction = (target: PageView, fallbackPrompt: string) => {
    if (onNavigate) {
      onNavigate(target);
      setOpen(false);
      return;
    }
    void sendMessage(fallbackPrompt);
  };

  const handleResetChat = () => {
    setMessages([]);
    setInput('');
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 20);
  };

  const handleInsertGreetingHint = () => {
    setInput((prev) => {
      const next = prev ? `${prev.trimEnd()} 😊 ` : 'السلام عليكم ';
      return next.slice(0, maxMessageLength);
    });
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
  };

  if (!enabled) return null;

  const showCharCounter = input.length >= Math.floor(maxMessageLength * 0.7);
  const hasListingCards = messages.some((m) => m.cards && m.cards.length > 0);
  const showStructuredActions = messages.length === 0 || (!hasListingCards && messages.length <= 2);

  return (
    <>
      {/* Minimalist 50px Circular Emerald & Gold AI Launcher with Top-Right Spark Rays */}
      {!open && (
        <div
          className={`fixed right-4 sm:right-6 z-30 ${
            offsetForBottomBar === 'detail'
              ? 'bottom-[calc(4.85rem+env(safe-area-inset-bottom))] lg:bottom-6'
              : offsetForBottomBar
              ? 'bottom-[calc(4.85rem+env(safe-area-inset-bottom))] md:bottom-6'
              : 'bottom-[max(1.25rem,env(safe-area-inset-bottom))] sm:bottom-6'
          }`}
        >
          {/* Decorative outward gold rays around top-right edge matching the mockup */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="pointer-events-none absolute -top-2.5 -right-2.5 w-5 h-5 text-[#D6AC58]"
          >
            <path
              d="M6 14L3 8M12 10L11 3M17 15L22 12"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
          </svg>
          <button
            ref={launcherRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="مساعد سوق الغنم"
            title="مساعد سوق الغنم"
            data-testid="ai-assistant-launcher"
            className="ai-launcher-enter relative w-[50px] h-[50px] rounded-full p-0 bg-[#103C2C] hover:bg-[#16523C] text-[#D6AC58] border-[1.5px] border-[#D6AC58] flex items-center justify-center shadow-[0_8px_22px_-4px_rgba(7,34,24,0.42)] transition-transform duration-150 hover:scale-[1.04] active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#D6AC58]"
          >
            <SaudiMinimalAiMark className="w-[22px] h-[22px]" />
          </button>
        </div>
      )}

      {/* Saudi Editorial AI Assistant Dialog — Exact Visual Architecture */}
      {open && (
        <section
          role="dialog"
          aria-modal="false"
          aria-label="مساعد سوق الغنم"
          data-testid="ai-assistant-dialog"
          dir="rtl"
          style={mobileViewportHeight ? { height: `${mobileViewportHeight}px` } : undefined}
          className="ai-panel-enter fixed inset-0 sm:inset-auto sm:bottom-6 sm:right-6 z-50 w-full sm:w-[372px] h-[100dvh] sm:h-[536px] sm:max-h-[calc(100dvh-2.5rem)] flex flex-col sm:overflow-visible"
        >
          {/* Top-right Saudi Sheep Mascot (peeks slightly above top-right edge on desktop) */}
          <div
            className="hidden sm:block pointer-events-none absolute -top-5 right-3 z-20 w-[94px] h-[94px] rounded-full overflow-hidden border-2 border-[#D6AC58]/70 bg-[#0E412F] shadow-[0_8px_20px_rgba(6,32,22,0.35)]"
            aria-hidden="true"
          >
            <SafeImage
              src={MASCOT_IMAGE_URL}
              alt="مساعد سوق الغنم"
              width={94}
              height={94}
              className="w-full h-full object-cover object-top scale-105"
            />
          </div>

          <div className="flex-1 min-h-0 flex flex-col bg-[#FAF8F4] dark:bg-[#0E1914] text-[#14261D] dark:text-[#EDF3EF] rounded-none sm:rounded-[24px] sm:border sm:border-[#DFD8C8] dark:sm:border-[#23372E] sm:shadow-[0_24px_60px_-14px_rgba(11,58,41,0.28)] overflow-hidden">
            {/* Curved Deep Emerald Header with Gold Arc */}
            <header className="relative shrink-0 bg-gradient-to-l from-[#093324] via-[#0E412F] to-[#17553E] px-4 pt-[max(0.85rem,env(safe-area-inset-top))] pb-7 sm:pt-4 sm:pb-7 text-white overflow-hidden">
              <div className="relative z-10 flex items-center justify-between gap-2">
                {/* Right side (RTL start): Mobile inline mascot + Gold headset emblem + Title */}
                <div className="flex items-center gap-2.5 min-w-0 sm:pr-[98px]">
                  <div className="sm:hidden w-11 h-11 rounded-full overflow-hidden border border-[#D6AC58]/75 bg-[#0E412F] shrink-0">
                    <SafeImage
                      src={MASCOT_IMAGE_URL}
                      alt="مساعد سوق الغنم"
                      width={44}
                      height={44}
                      className="w-full h-full object-cover object-top"
                    />
                  </div>
                  <div className="w-9 h-9 rounded-full border border-[#D6AC58]/70 bg-[#0A2F22]/70 text-[#D6AC58] flex items-center justify-center shrink-0">
                    <Headset size={18} aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-display text-[16px] font-extrabold text-white leading-tight truncate">
                      مساعد سوق الغنم
                    </h2>
                    <p className="text-[11.5px] font-medium text-[#E9DFC9] leading-snug truncate">
                      في خدمتك دائمًا
                    </p>
                  </div>
                </div>

                {/* Left side (RTL end): Circular Reset & Close Buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleResetChat}
                    disabled={sending && messages.length === 0}
                    aria-label="إعادة بدء المحادثة"
                    title="محادثة جديدة"
                    className="w-8 h-8 rounded-full border border-white/25 bg-[#082A1D]/45 text-[#E9DFC9] hover:text-white hover:bg-[#134D38] flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#D6AC58]"
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      launcherRef.current?.focus();
                    }}
                    aria-label="إغلاق مساعد السوق"
                    title="إغلاق"
                    className="w-8 h-8 rounded-full border border-[#D6AC58]/70 bg-[#082A1D]/60 text-white hover:bg-[#134D38] flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#D6AC58]"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Sweeping Cream & Gold Curved Wave Bottom Border */}
              <svg
                viewBox="0 0 380 34"
                preserveAspectRatio="none"
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 w-full h-7"
              >
                <path
                  d="M0,4 C95,28 245,32 380,10 L380,34 L0,34 Z"
                  className="fill-[#FAF8F4] dark:fill-[#0E1914]"
                />
                <path
                  d="M0,4 C95,28 245,32 380,10"
                  fill="none"
                  stroke="#DFBA68"
                  strokeWidth="2.4"
                />
              </svg>
            </header>

            {/* Conversation Canvas */}
            <div
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-3.5 pt-2 pb-3 flex flex-col gap-3"
              aria-live="polite"
            >
              {/* Initial Welcome Bubble when chat is fresh */}
              {messages.length === 0 ? (
                <div className="flex items-start gap-2.5 pt-1">
                  <SaudiBotAvatar />
                  <div className="flex-1 min-w-0 rounded-2xl rounded-tr-xs bg-white dark:bg-[#14231C] border border-[#EAE4D7] dark:border-[#22352C] px-4 py-3 shadow-[0_6px_18px_-6px_rgba(16,60,44,0.10)]">
                    <p className="text-[13.5px] font-semibold text-[#14261D] dark:text-[#EDF3EF] leading-relaxed">
                      حيّاك الله في سوق الغنم! 😊
                      <br />
                      كيف أقدر أساعدك اليوم؟
                    </p>
                    <SheepBubbleDivider />
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  {messages.map((msg) => (
                    <div key={msg.id} className="ai-msg-enter flex flex-col gap-2">
                      {msg.role === 'user' ? (
                        <div className="flex items-start justify-start gap-2">
                          <span
                            aria-hidden="true"
                            className="w-8 h-8 rounded-full bg-[#7E9279] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs"
                          >
                            <User size={16} />
                          </span>
                          <div className="max-w-[78%] rounded-2xl rounded-tr-xs bg-[#E8EDE1] dark:bg-[#1C3025] text-[#14261D] dark:text-[#EDF3EF] px-3.5 py-2 shadow-xs">
                            <p className="text-[13px] font-medium leading-[1.65] whitespace-pre-line break-words [overflow-wrap:anywhere]">
                              {msg.content}
                            </p>
                            <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#6B7D72] dark:text-[#98ABA1] tabular-nums">
                              <span>{msg.timeLabel}</span>
                              <CheckCheck size={12} className="text-[#4B7F67]" aria-hidden="true" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full flex flex-col gap-2">
                          <div className="flex items-start gap-2.5">
                            <SaudiBotAvatar />
                            <div
                              className={`flex-1 min-w-0 rounded-2xl rounded-tr-xs px-4 py-3 shadow-[0_6px_18px_-6px_rgba(16,60,44,0.10)] ${
                                msg.isError
                                  ? 'bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-100 border border-red-200 dark:border-red-800/70'
                                  : 'bg-white dark:bg-[#14231C] text-[#14261D] dark:text-[#EDF3EF] border border-[#EAE4D7] dark:border-[#22352C]'
                              }`}
                            >
                              <p className="text-[13px] font-medium leading-[1.7] whitespace-pre-line break-words [overflow-wrap:anywhere]">
                                {msg.content}
                              </p>

                              {msg.isError && msg.retryPrompt ? (
                                <button
                                  type="button"
                                  disabled={sending}
                                  onClick={() => void sendMessage(msg.retryPrompt!)}
                                  className="mt-2 min-h-[34px] px-2.5 py-1 rounded-lg bg-white dark:bg-[#1A2D24] border border-red-200 dark:border-red-800 text-xs font-semibold text-red-800 dark:text-red-200 hover:bg-red-100/70 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                                >
                                  <RotateCcw size={12} aria-hidden="true" />
                                  <span>إعادة المحاولة</span>
                                </button>
                              ) : (
                                <>
                                  <SheepBubbleDivider />
                                  <div className="mt-1 flex items-center justify-end text-[10px] text-[#7A8980] dark:text-[#98ABA1] tabular-nums">
                                    <span>{msg.timeLabel}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Compact Real Marketplace Listing Cards */}
                          {msg.cards && msg.cards.length > 0 && (
                            <div className="w-full space-y-1.5" data-testid="ai-listing-cards">
                              {msg.cards.map((card) => {
                                const metaParts = [card.categoryName, card.breedName, card.city]
                                  .filter(Boolean)
                                  .join(' · ');
                                return (
                                  <button
                                    key={card.id}
                                    type="button"
                                    onClick={() => handleCardClick(card.id)}
                                    data-testid={`ai-listing-card-${card.id}`}
                                    className="group w-full text-right bg-white dark:bg-[#14231C] border border-[#DFBA68]/70 dark:border-[#22352C] hover:border-[#C59328] rounded-xl p-2 flex items-center gap-2.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0B3A29] dark:focus-visible:outline-[#D6AC58]"
                                  >
                                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-[#F3EFE6] dark:bg-[#1A2D24] shrink-0">
                                      {card.imageUrl ? (
                                        <SafeImage
                                          src={card.imageUrl}
                                          alt={card.title}
                                          width={56}
                                          height={56}
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[#5A6C63] dark:text-[#98ABA1]">
                                          <SaudiMinimalAiMark className="w-5 h-5 opacity-60" />
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex-1 min-w-0 space-y-0.5">
                                      <div className="flex items-center justify-between gap-1.5">
                                        <span className="font-display text-xs font-bold text-[#14261D] dark:text-white truncate">
                                          {card.title}
                                        </span>
                                        {card.sellerVerified && (
                                          <ShieldCheck
                                            size={12}
                                            className="text-[#0B3A29] dark:text-[#5ED1A1] shrink-0"
                                            aria-label="مربي موثق"
                                          />
                                        )}
                                      </div>

                                      {metaParts && (
                                        <p className="text-[11px] text-[#5A6C63] dark:text-[#9CB0A5] truncate">
                                          {metaParts}
                                        </p>
                                      )}

                                      <div className="flex items-center justify-between gap-2 pt-0.5">
                                        <span className="font-display text-xs font-extrabold text-[#0B3A29] dark:text-[#5ED1A1] tabular-nums">
                                          {formatPriceSar(card.priceAmount)}
                                        </span>
                                        <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#9E731D] dark:text-[#D6AC58] group-hover:underline whitespace-nowrap shrink-0">
                                          <span>عرض</span>
                                          <ArrowLeft size={11} aria-hidden="true" />
                                        </span>
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Dynamic Follow-up Chips */}
                          {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                            <div className="w-full flex flex-wrap gap-1.5 pt-0.5">
                              {msg.suggestedFollowUps.map((promptText) => (
                                <button
                                  key={promptText}
                                  type="button"
                                  disabled={sending}
                                  onClick={() => void sendMessage(promptText)}
                                  className="min-h-[32px] text-[11.5px] font-medium px-3 py-1 rounded-full border border-[#DFBA68]/80 dark:border-[#24382F] bg-white dark:bg-[#14231C] hover:bg-[#FBF4E4] dark:hover:bg-[#1A2D24] text-[#14261D] dark:text-[#EDF3EF] transition-colors cursor-pointer disabled:opacity-50 text-right"
                                >
                                  {promptText}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {sending && (
                    <div className="ai-msg-enter flex items-center gap-2.5">
                      <SaudiBotAvatar className="w-8 h-8" />
                      <div className="rounded-2xl rounded-tr-xs bg-white dark:bg-[#14231C] border border-[#EAE4D7] dark:border-[#22352C] px-3.5 py-2 text-xs text-[#5A6C63] dark:text-[#9CB0A5] inline-flex items-center gap-2 shadow-xs">
                        <span className="inline-flex items-center gap-1" aria-hidden="true">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#0B3A29] dark:bg-[#D6AC58] animate-bounce [animation-delay:-0.2s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-[#0B3A29] dark:bg-[#D6AC58] animate-bounce [animation-delay:-0.1s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-[#D6AC58] animate-bounce" />
                        </span>
                        <span>يكتب الآن...</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 5 Gold-Outlined Pill Action Buttons (2+2+1 Layout Matching Reference Screenshot) */}
              {showStructuredActions && (
                <div
                  className="mt-auto pt-2 grid grid-cols-2 gap-2"
                  role="group"
                  aria-label="خيارات المساعد السريعة"
                >
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => void sendMessage('أبي نعيمي بالرياض')}
                    className="min-h-[40px] px-3 py-2 rounded-full border border-[#DFBA68] bg-white dark:bg-[#14231C] hover:bg-[#FCF5E6] dark:hover:bg-[#1A2D24] text-[12.5px] font-semibold text-[#14261D] dark:text-[#EDF3EF] flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shadow-[0_2px_6px_-2px_rgba(16,60,44,0.06)]"
                  >
                    <Search size={15} className="text-[#C59328] shrink-0" aria-hidden="true" />
                    <span>البحث عن أغنام</span>
                  </button>

                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => void sendMessage('كم أسعار الحري والنجدي؟')}
                    className="min-h-[40px] px-3 py-2 rounded-full border border-[#DFBA68] bg-white dark:bg-[#14231C] hover:bg-[#FCF5E6] dark:hover:bg-[#1A2D24] text-[12.5px] font-semibold text-[#14261D] dark:text-[#EDF3EF] flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shadow-[0_2px_6px_-2px_rgba(16,60,44,0.06)]"
                  >
                    <BarChart3 size={15} className="text-[#C59328] shrink-0" aria-hidden="true" />
                    <span>معرفة الأسعار</span>
                  </button>

                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => handleRouteAction('add', 'كيف أضيف إعلان جديد في سوق الغنم؟')}
                    className="min-h-[40px] px-3 py-2 rounded-full border border-[#DFBA68] bg-white dark:bg-[#14231C] hover:bg-[#FCF5E6] dark:hover:bg-[#1A2D24] text-[12.5px] font-semibold text-[#14261D] dark:text-[#EDF3EF] flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shadow-[0_2px_6px_-2px_rgba(16,60,44,0.06)]"
                  >
                    <PlusSquare size={15} className="text-[#C59328] shrink-0" aria-hidden="true" />
                    <span>إضافة إعلان</span>
                  </button>

                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => void sendMessage('كيف أستخدم منصة سوق الغنم وأقدم سوم؟')}
                    className="min-h-[40px] px-3 py-2 rounded-full border border-[#DFBA68] bg-white dark:bg-[#14231C] hover:bg-[#FCF5E6] dark:hover:bg-[#1A2D24] text-[12.5px] font-semibold text-[#14261D] dark:text-[#EDF3EF] flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shadow-[0_2px_6px_-2px_rgba(16,60,44,0.06)]"
                  >
                    <HelpCircle size={15} className="text-[#C59328] shrink-0" aria-hidden="true" />
                    <span>الأسئلة الشائعة</span>
                  </button>

                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => handleRouteAction('contact', 'كيف أتواصل مع الدعم الفني؟')}
                    className="col-span-2 min-h-[40px] px-4 py-2 rounded-full border border-[#DFBA68] bg-white dark:bg-[#14231C] hover:bg-[#FCF5E6] dark:hover:bg-[#1A2D24] text-[12.5px] font-semibold text-[#14261D] dark:text-[#EDF3EF] flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shadow-[0_2px_6px_-2px_rgba(16,60,44,0.06)]"
                  >
                    <Headset size={15} className="text-[#C59328] shrink-0" aria-hidden="true" />
                    <span>تواصل مع الدعم الفني</span>
                  </button>
                </div>
              )}

              <div ref={listEndRef} />
            </div>

            {/* Rounded Pill Composer + Circular Emerald Send Button */}
            <form
              onSubmit={handleSubmit}
              className="shrink-0 bg-[#FAF8F4] dark:bg-[#0E1914] px-3.5 pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            >
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 flex items-center gap-1.5 rounded-full border border-[#DED8C8] dark:border-[#253A30] bg-white dark:bg-[#14231C] px-3 py-1 transition-colors focus-within:border-[#0B3A29] dark:focus-within:border-[#D6AC58]">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={input}
                    maxLength={maxMessageLength}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder="اكتب رسالتك هنا..."
                    aria-label="رسالة مساعد السوق"
                    data-testid="ai-assistant-input"
                    className="flex-1 min-w-0 max-h-[84px] resize-none bg-transparent py-1.5 text-[13px] text-[#14261D] dark:text-white placeholder:text-[#8E9B94] dark:placeholder:text-[#8DA196] focus:outline-none leading-relaxed"
                  />
                  <button
                    type="button"
                    onClick={handleInsertGreetingHint}
                    aria-label="إدراج تحية سريعة"
                    title="إدراج تحية سريعة"
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[#8B9891] hover:text-[#0B3A29] dark:hover:text-[#D6AC58] transition-colors cursor-pointer shrink-0"
                  >
                    <Smile size={17} aria-hidden="true" />
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  aria-label="إرسال الرسالة"
                  data-testid="ai-assistant-send"
                  className="w-11 h-11 sm:w-10 sm:h-10 rounded-full bg-[#103C2C] hover:bg-[#17553E] text-white disabled:bg-[#DFDBD0] disabled:text-[#8F9B94] dark:disabled:bg-[#1C2E26] dark:disabled:text-[#5B7065] flex items-center justify-center shrink-0 shadow-sm transition-colors cursor-pointer disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[#D6AC58]"
                >
                  <Send size={17} strokeWidth={2} aria-hidden="true" className="-translate-x-0.5" />
                </button>
              </div>

              {(usage || showCharCounter) && (
                <div className="mt-1 px-1 flex items-center justify-between gap-2 text-[10.5px] text-[#6B7C73] dark:text-[#8DA196]">
                  <span className="truncate tabular-nums">
                    {usage ? `المتبقي اليوم: ${usage.remainingToday} من ${usage.dailyLimit}` : ''}
                  </span>
                  {showCharCounter && (
                    <span className="tabular-nums shrink-0">
                      {input.length}/{maxMessageLength}
                    </span>
                  )}
                </div>
              )}
            </form>
          </div>
        </section>
      )}
    </>
  );
}
