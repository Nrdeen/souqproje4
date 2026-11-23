import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BadgeDollarSign,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Flag,
  Heart,
  Home,
  LogIn,
  MapPin,
  Maximize2,
  MessageSquare,
  Minus,
  Pencil,
  Phone,
  Play,
  Plus,
  Scale,
  Share2,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  Trash2,
  User as UserIcon,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import type {
  CommissionEligibility,
  CommissionSettings,
} from '../lib/commission';
import type {
  Breed,
  Category,
  IndicativePrice,
  Listing,
  PriceOffer,
  Region,
  SellerProfile,
  User,
} from '../types/marketplace';
import { formatPriceSar, formatRelativeArabicTime, formatStatusLabel } from '../lib/format';
import {
  buildListingSharePayload,
  canUseNativeShare,
  copyTextWithFallback,
  triggerNativeShareWithFallback,
} from '../lib/share';
import { SafeImage } from './SafeImage';
import { Modal } from './Modal';
import { MarkSoldModal } from './MarkSoldModal';
import { ImageLightbox } from './ImageLightbox';
import { ListingCard } from './ListingCard';
import { ListingCommentsSection } from './ListingCommentsSection';
import { isSellerVerified, VerifiedSellerBadge } from './VerifiedSellerBadge';
import { buildSellerContactLinks } from '../lib/marketplace-helpers';
import { api } from '../lib/api';
import type { AuthMode } from '../lib/router';
import { DynamicHeroBanner } from './DynamicHeroBanner';

interface ListingDetailViewProps {
  listing: Listing;
  /** null for visitors who are not signed in. */
  currentUser: User | null;
  category?: Category;
  subCategory?: Category;
  breed?: Breed;
  region?: Region;
  seller?: SellerProfile;
  offers: PriceOffer[];
  isFavorite: boolean;
  isLiked?: boolean;
  favoriteIds?: string[];
  likedListingIds?: string[];
  onBack: () => void;
  onGoHome?: () => void;
  onToggleFavorite: (listingId: string) => void;
  onToggleLike?: (listingId: string) => void;
  onStartConversation: (listingId: string, initialMessage: string) => Promise<void>;
  onSubmitPriceOffer: (
    listingId: string,
    payload: { offeredPrice: number; quantity: number; note: string }
  ) => Promise<void>;
  onRespondToOffer: (offerId: string, status: 'accepted' | 'rejected') => Promise<void>;
  onReportListing: (listingId: string, reason: string, details: string) => Promise<void>;
  onOpenSellerProfile: (sellerId: string) => void;
  onNotify?: (message: string) => void;
  comparableListings: Listing[];
  allCategories: Category[];
  allBreeds: Breed[];
  allRegions: Region[];
  allSellers: SellerProfile[];
  compareIds: string[];
  compareListings: Listing[];
  onToggleCompare: (listingId: string) => void;
  onClearCompare: () => void;
  onSelectListing: (listing: Listing) => void;
  onEditListing?: (listing: Listing) => void;
  onMarkSold?: (listingId: string) => Promise<void>;
  commissionSettings?: CommissionSettings | null;
  commissionEligibility?: CommissionEligibility | null;
  onRefreshData?: () => Promise<void>;
  commentRefreshSignal?: number;
  targetCommentId?: string | null;
  onRequireAuth?: (mode?: AuthMode) => void;
  indicativePrices?: IndicativePrice[];
  onOpenPriceIndex?: () => void;
}

function breedPriceReading(
  listing: Listing,
  breed: Breed | undefined,
  rows: IndicativePrice[]
): { sentence: string; min: number; max: number; avg: number; marker: number } | null {
  if (!breed || rows.length === 0) return null;
  const row = rows.find((item) => item.breedName.includes(breed.name));
  if (!row || row.maxPrice <= row.minPrice) return null;
  const span = row.ageGroup.match(/(\d+)\s*[-–]\s*(\d+)/);
  const ageFar = span
    ? listing.ageMonths < Number(span[1]) - 3 || listing.ageMonths > Number(span[2]) + 3
    : false;
  const marker = Math.min(
    100,
    Math.max(0, ((listing.priceAmount - row.minPrice) / (row.maxPrice - row.minPrice)) * 100)
  );
  const delta = listing.priceAmount - row.avgPrice;
  const pct = row.avgPrice > 0 ? Math.round((Math.abs(delta) / row.avgPrice) * 100) : 0;
  let sentence: string;
  if (ageFar) {
    sentence = `مؤشر «${breed.name}» لفئة ${row.ageGroup} بين ${formatPriceSar(row.minPrice)} و${formatPriceSar(row.maxPrice)}. عمر هذا العرض ${listing.ageMonths} شهراً، فالقراءة استرشادية وليست حكماً على السعر.`;
  } else if (listing.priceAmount > row.maxPrice) {
    sentence = `السعر أعلى من سقف مؤشر ${row.ageGroup} البالغ ${formatPriceSar(row.maxPrice)}.`;
  } else if (listing.priceAmount < row.minPrice) {
    sentence = `السعر أقل من أرضية مؤشر ${row.ageGroup} البالغة ${formatPriceSar(row.minPrice)}.`;
  } else if (pct < 5) {
    sentence = `السعر قريب من متوسط مؤشر ${row.ageGroup} (${formatPriceSar(row.avgPrice)}).`;
  } else if (delta > 0) {
    sentence = `ضمن مدى مؤشر ${row.ageGroup}، وأعلى من المتوسط بنحو ${pct}٪.`;
  } else {
    sentence = `ضمن مدى مؤشر ${row.ageGroup}، وأقل من المتوسط بنحو ${pct}٪.`;
  }
  return { sentence, min: row.minPrice, max: row.maxPrice, avg: row.avgPrice, marker };
}

export function ListingDetailView({
  listing,
  currentUser,
  category,
  subCategory,
  breed,
  region,
  seller,
  offers,
  isFavorite,
  isLiked = false,
  favoriteIds = [],
  likedListingIds = [],
  onBack,
  onGoHome,
  onToggleFavorite,
  onToggleLike,
  onStartConversation,
  onSubmitPriceOffer,
  onRespondToOffer,
  onReportListing,
  onOpenSellerProfile,
  onNotify,
  comparableListings,
  allCategories,
  allBreeds,
  allRegions,
  allSellers,
  compareIds,
  compareListings,
  onToggleCompare,
  onClearCompare,
  onSelectListing,
  onEditListing,
  onMarkSold,
  commissionSettings = null,
  commissionEligibility = null,
  onRefreshData,
  commentRefreshSignal = 0,
  targetCommentId = null,
  onRequireAuth,
  indicativePrices = [],
  onOpenPriceIndex,
}: ListingDetailViewProps) {
  const [activeMediaIdx, setActiveMediaIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const zoomBtnRef = useRef<HTMLButtonElement | null>(null);
  const [messageText, setMessageText] = useState(
    `السلام عليكم، أستفسر عن إعلان: ${listing.title}`
  );
  const [sendingMsg, setSendingMsg] = useState(false);
  const [msgSuccess, setMsgSuccess] = useState(false);
  const [msgError, setMsgError] = useState('');

  // Price Offer / Negotiation Modal State
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offeredPrice, setOfferedPrice] = useState(
    String(listing.expectedPrice || Math.round((listing.priceAmount * 0.92) / 10) * 10)
  );
  const [offerQuantity, setOfferQuantity] = useState('1');
  const [offerNote, setOfferNote] = useState('');
  const [offerSubmitting, setOfferSubmitting] = useState(false);
  const [offerError, setOfferError] = useState('');
  const [offerSuccess, setOfferSuccess] = useState(false);

  // Report Modal State
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('بيانات غير مطابقة');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const [reportError, setReportError] = useState('');
  const [showPhone, setShowPhone] = useState(false);
  const [revealedContact, setRevealedContact] = useState<{
    phone?: string;
    whatsapp?: string;
  } | null>(null);
  const [revealingContact, setRevealingContact] = useState(false);
  const [contactError, setContactError] = useState('');
  const [markingSold, setMarkingSold] = useState(false);
  const [markSoldOpen, setMarkSoldOpen] = useState(false);
  const [requestingFeature, setRequestingFeature] = useState(false);

  // Share Listing State
  const [copiedLink, setCopiedLink] = useState(false);
  const [manualShareUrlVisible, setManualShareUrlVisible] = useState(false);
  const [localToast, setLocalToast] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const localToastTimerRef = useRef<number | null>(null);

  // Livestock Comparison State
  const [comparePickId, setComparePickId] = useState('');
  const [showDiffsOnly, setShowDiffsOnly] = useState(false);
  const compareSectionRef = useRef<HTMLDivElement | null>(null);
  const directMsgRef = useRef<HTMLTextAreaElement | null>(null);
  const galleryTouchRef = useRef<{ x: number; y: number } | null>(null);
  const activeListingIdRef = useRef(listing.id);
  activeListingIdRef.current = listing.id;
  const reportCloseTimerRef = useRef<number | null>(null);

  const isInCompare = compareIds.includes(listing.id);
  const availableToCompare = useMemo(
    () => comparableListings.filter((item) => !compareIds.includes(item.id)),
    [comparableListings, compareIds]
  );

  useEffect(() => {
    if (availableToCompare.length > 0 && !availableToCompare.some((l) => l.id === comparePickId)) {
      const nextPreferred =
        availableToCompare.find((l) => l.id !== listing.id) || availableToCompare[0];
      setComparePickId(nextPreferred.id);
    } else if (availableToCompare.length === 0) {
      setComparePickId('');
    }
  }, [availableToCompare, comparePickId, listing.id]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      if (localToastTimerRef.current !== null) {
        window.clearTimeout(localToastTimerRef.current);
      }
      if (reportCloseTimerRef.current !== null) {
        window.clearTimeout(reportCloseTimerRef.current);
      }
    };
  }, []);

  const [bannerSimQty, setBannerSimQty] = useState<number>(() => Math.max(1, listing.quantity));

  useEffect(() => {
    setBannerSimQty(Math.max(1, listing.quantity));
    if (reportCloseTimerRef.current !== null) {
      window.clearTimeout(reportCloseTimerRef.current);
      reportCloseTimerRef.current = null;
    }
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
    if (localToastTimerRef.current !== null) {
      window.clearTimeout(localToastTimerRef.current);
      localToastTimerRef.current = null;
    }
    setActiveMediaIdx(0);
    setLightboxOpen(false);
    setManualShareUrlVisible(false);
    setCopiedLink(false);
    setLocalToast(null);
    setShowPhone(false);
    setRevealedContact(null);
    setRevealingContact(false);
    setContactError('');
    setMessageText(`السلام عليكم، أستفسر عن إعلان: ${listing.title}`);
    setSendingMsg(false);
    setMsgSuccess(false);
    setMsgError('');
    setShowOfferModal(false);
    setOfferedPrice(
      String(listing.expectedPrice || Math.round((listing.priceAmount * 0.92) / 10) * 10)
    );
    setOfferQuantity('1');
    setOfferNote('');
    setOfferSubmitting(false);
    setOfferError('');
    setOfferSuccess(false);
    setShowReportModal(false);
    setReportReason('بيانات غير مطابقة');
    setReportDetails('');
    setReportSent(false);
    setReportError('');
    setMarkingSold(false);
    setMarkSoldOpen(false);
    setRequestingFeature(false);
    setShowDiffsOnly(false);
  }, [listing.id]);

  const images = useMemo(
    () =>
      listing.images.length > 0
        ? [...listing.images].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        : [{ id: 'default', url: breed?.imageUrl || '', position: 1 }],
    [listing.images, breed?.imageUrl]
  );

  const galleryItems = useMemo(() => {
    const items: Array<
      | { id: string; kind: 'image'; url: string }
      | { id: string; kind: 'video'; url: string; mimeType?: string }
    > = images.map((img) => ({ id: img.id, kind: 'image', url: img.url }));
    if (listing.video?.url) {
      items.push({
        id: listing.video.id || 'listing-video',
        kind: 'video',
        url: listing.video.url,
        mimeType: listing.video.mimeType,
      });
    }
    return items;
  }, [images, listing.video]);

  const safeMediaIdx = activeMediaIdx < galleryItems.length ? activeMediaIdx : 0;
  const activeMedia = galleryItems[safeMediaIdx] || galleryItems[0];
  const activeImageIndex = useMemo(() => {
    if (activeMedia?.kind !== 'image') return 0;
    const found = images.findIndex((img) => img.url === activeMedia.url);
    return found >= 0 ? found : 0;
  }, [activeMedia, images]);

  const allowsOffers =
    listing.allowPriceOffers !== undefined ? listing.allowPriceOffers : listing.isNegotiable;
  const isOwner = !!currentUser && currentUser.id === listing.sellerId;
  const canRespondOffers = isOwner || currentUser?.role === 'admin';
  const listingOffers = offers.filter((o) => o.listingId === listing.id);
  const totalHerdValue =
    listing.quantity > 1 ? listing.priceAmount * listing.quantity : null;

  // Derive up to 3 related listings using existing comparableListings data (no extra network call)
  const relatedListings = useMemo(() => {
    const candidates = comparableListings.filter(
      (item) => item.id !== listing.id && item.status === 'Published'
    );
    if (candidates.length === 0) return [];
    const scored = candidates.map((item) => {
      let score = 0;
      if (item.breedId === listing.breedId) score += 4;
      if (item.categoryId === listing.categoryId) score += 2;
      if (item.regionId === listing.regionId) score += 1;
      return { item, score };
    });
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.item.publishedAt.localeCompare(a.item.publishedAt);
    });
    return scored.slice(0, 3).map((entry) => entry.item);
  }, [comparableListings, listing.id, listing.breedId, listing.categoryId, listing.regionId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    const targetListingId = listing.id;
    setSendingMsg(true);
    setMsgError('');
    setMsgSuccess(false);
    try {
      await onStartConversation(targetListingId, messageText.trim());
      if (activeListingIdRef.current !== targetListingId) return;
      setMsgSuccess(true);
    } catch (err: any) {
      if (activeListingIdRef.current !== targetListingId) return;
      setMsgError(err?.message || 'تعذر إرسال رسالتك، حاول مرة أخرى');
    } finally {
      if (activeListingIdRef.current === targetListingId) {
        setSendingMsg(false);
      }
    }
  };

  const handleOpenOfferModal = () => {
    if (!currentUser) {
      onRequireAuth?.('login');
      return;
    }
    setOfferError('');
    setOfferedPrice(
      String(listing.expectedPrice || Math.round((listing.priceAmount * 0.92) / 10) * 10)
    );
    setOfferQuantity('1');
    setOfferNote('');
    setShowOfferModal(true);
  };

  const handleOfferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOfferError('');
    const parsedPrice = Number(offeredPrice);
    const parsedQty = Number(offerQuantity);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setOfferError('يرجى إدخال قيمة عرض سعر صحيحة بالريال السعودي');
      return;
    }
    if (!Number.isInteger(parsedQty) || parsedQty < 1 || parsedQty > listing.quantity) {
      setOfferError(`الكمية يجب أن تكون عدداً صحيحاً بين 1 و ${listing.quantity} رأس`);
      return;
    }
    if (offerNote.trim().length > 500) {
      setOfferError('ملاحظة عرض السعر يجب ألا تتجاوز 500 حرف');
      return;
    }
    const targetListingId = listing.id;
    setOfferSubmitting(true);
    setOfferSuccess(false);
    try {
      await onSubmitPriceOffer(targetListingId, {
        offeredPrice: parsedPrice,
        quantity: parsedQty,
        note: offerNote.trim(),
      });
      if (activeListingIdRef.current !== targetListingId) return;
      setShowOfferModal(false);
      setOfferSuccess(true);
    } catch (err: any) {
      if (activeListingIdRef.current !== targetListingId) return;
      setOfferError(err?.message || 'تعذر إرسال عرض السعر');
    } finally {
      if (activeListingIdRef.current === targetListingId) {
        setOfferSubmitting(false);
      }
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReportError('');
    const targetListingId = listing.id;
    try {
      await onReportListing(targetListingId, reportReason, reportDetails);
    } catch (err: any) {
      if (activeListingIdRef.current !== targetListingId) return;
      setReportError(err?.message || 'تعذر إرسال البلاغ، حاول مرة أخرى');
      return;
    }
    if (activeListingIdRef.current !== targetListingId) return;
    setReportSent(true);
    if (reportCloseTimerRef.current !== null) {
      window.clearTimeout(reportCloseTimerRef.current);
    }
    reportCloseTimerRef.current = window.setTimeout(() => {
      reportCloseTimerRef.current = null;
      if (activeListingIdRef.current !== targetListingId) return;
      setShowReportModal(false);
      setReportSent(false);
      setReportDetails('');
    }, 1200);
  };

  const formatOfferStatus = (status: PriceOffer['status']) => {
    if (status === 'accepted') return 'عرض مقبول';
    if (status === 'rejected') return 'عرض مرفوض';
    return 'بانتظار رد المربي';
  };

  const offerTotal =
    (Number(offeredPrice) > 0 ? Number(offeredPrice) : 0) *
    (Number(offerQuantity) > 0 ? Number(offerQuantity) : 1);

  const sharePayload = useMemo(
    () =>
      buildListingSharePayload({
        listing,
        breedName: breed?.name,
        regionName: region?.name,
      }),
    [listing, breed?.name, region?.name]
  );
  const supportsNativeShare = canUseNativeShare();
  const likesCount = listing.likesCount ?? 0;
  const likesEnabled = listing.status === 'Published';
  const priceReading = useMemo(
    () => breedPriceReading(listing, breed, indicativePrices),
    [listing, breed, indicativePrices]
  );

  const contactLinks = useMemo(
    () =>
      buildSellerContactLinks({
        isSignedIn: Boolean(currentUser),
        isOwner,
        seller: revealedContact,
        listingTitle: listing.title,
      }),
    [currentUser, isOwner, revealedContact, listing.title]
  );

  const handleRevealContact = async () => {
    if (!currentUser || isOwner || revealingContact) return;
    if (listing.status !== 'Published') {
      setContactError('بيانات الاتصال المباشر متاحة فقط للإعلانات المنشورة');
      return;
    }
    const targetListingId = listing.id;
    setRevealingContact(true);
    setContactError('');
    try {
      const res = await api.revealListingContact(targetListingId);
      if (activeListingIdRef.current !== targetListingId) return;
      const nextContact = {
        phone: res.phone || undefined,
        whatsapp: res.whatsapp || undefined,
      };
      if (!nextContact.phone && !nextContact.whatsapp) {
        setContactError('لا تتوفر أرقام اتصال مباشر لهذا المربي، يمكنك المراسلة عبر المنصة أدناه.');
      } else {
        setRevealedContact(nextContact);
        setShowPhone(true);
      }
    } catch (err: any) {
      if (activeListingIdRef.current !== targetListingId) return;
      setContactError(err?.message || 'تعذر إظهار بيانات التواصل حالياً، حاول مرة أخرى');
    } finally {
      if (activeListingIdRef.current === targetListingId) {
        setRevealingContact(false);
      }
    }
  };

  const handleConfirmMarkSold = async () => {
    if (markingSold) return;
    setMarkSoldOpen(true);
  };

  const handleRequestFeatured = async () => {
    if (requestingFeature) return;
    setRequestingFeature(true);
    try {
      await api.requestListingFeatured(listing.id);
      await onRefreshData?.();
      onNotify?.('تم تسجيل طلب تمييز الإعلان؛ يمكنك تأكيد الحوالة من سجل العمولة في لوحة حسابي');
    } catch (err: any) {
      onNotify?.(err?.message || 'تعذر تسجيل طلب التمييز');
    } finally {
      setRequestingFeature(false);
    }
  };

  const showToastNotification = (message: string) => {
    if (onNotify) {
      onNotify(message);
      return;
    }
    setLocalToast(message);
    if (localToastTimerRef.current !== null) {
      window.clearTimeout(localToastTimerRef.current);
    }
    localToastTimerRef.current = window.setTimeout(() => {
      setLocalToast(null);
      localToastTimerRef.current = null;
    }, 3200);
  };

  const handleCopyShareLink = async () => {
    const copied = await copyTextWithFallback(sharePayload.url);
    if (copied) {
      setCopiedLink(true);
      setManualShareUrlVisible(false);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedLink(false);
        copyTimerRef.current = null;
      }, 2500);
      showToastNotification('تم نسخ رابط الإعلان إلى الحافظة');
    } else {
      setManualShareUrlVisible(true);
      showToastNotification('تعذر النسخ التلقائي، يمكنك نسخ الرابط الظاهر يدوياً');
    }
  };

  const handleNativeShare = async () => {
    await triggerNativeShareWithFallback({
      title: sharePayload.title,
      text: sharePayload.summary,
      url: sharePayload.url,
      onFallbackCopy: handleCopyShareLink,
    });
  };

  const focusDirectMessageForm = () => {
    directMsgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      directMsgRef.current?.focus();
    }, 220);
  };

  return (
    <section className="bg-[var(--color-canvas)] transition-colors overflow-x-clip">
      {/* Creative Interactive Listing Deal & Spec Command Banner */}
      <DynamicHeroBanner
        pageKey="detail"
        variant="emerald-royal"
        headingAs="h2"
        compact
          breadcrumbs={[
            ...(onGoHome ? [{ label: 'الرئيسية', onClick: onGoHome }] : []),
            { label: 'دليل الإعلانات', onClick: onBack },
            ...(category ? [{ label: category.name }] : []),
            ...(breed ? [{ label: breed.name }] : []),
          ]}
          contextLabel={`${region ? region.name : ''}${listing.city ? ` · ${listing.city}` : ''}`}
          eyebrow={
            breed?.name
              ? `عرض موثق · ${breed.name}${category ? ` (${category.name})` : ''}`
              : 'عرض مواشي مباشر في السوق'
          }
          title={listing.title}
          subHeadline={`السعر المطلوب ${formatPriceSar(listing.priceAmount)} للرأس · متاح ${listing.quantity} ${
            listing.quantity === 1 ? 'رأس' : 'رؤوس'
          } بمتوسط وزن ${listing.weightKg} كجم وعمر ${listing.ageMonths} شهور${
            listing.vaccinated ? ' · محصّن بالكامل' : ''
          }.`}
          stats={[
            {
              label: 'سعر الرأس',
              value: formatPriceSar(listing.priceAmount),
              accent: true,
            },
            {
              label: 'الكمية المتاحة',
              value: `${listing.quantity} رأس`,
            },
            {
              label: 'العمر / الوزن',
              value: `${listing.ageMonths} ش · ${listing.weightKg} كجم`,
            },
          ]}
          actions={
            <>
              <button
                type="button"
                onClick={onBack}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-white/25 bg-white/[0.08] hover:bg-white/[0.15] inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                <ArrowRight size={15} aria-hidden="true" />
                <span>العودة إلى الإعلانات</span>
              </button>

              {listing.status === 'Published' && (
                <button
                  type="button"
                  onClick={() => onToggleCompare(listing.id)}
                  className={`min-h-[40px] px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                    isInCompare
                      ? 'bg-[#F4C569] border-[#F4C569] text-[#0B231A]'
                      : 'bg-white/[0.08] border-white/25 text-white hover:border-[#F4C569]'
                  }`}
                >
                  <Scale size={14} aria-hidden="true" />
                  <span>{isInCompare ? 'ضمن المقارنة' : 'مقارنة'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleCopyShareLink}
                aria-label="مشاركة الإعلان ونسخ الرابط"
                className={`min-h-[40px] px-3.5 py-2 rounded-xl border text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  copiedLink
                    ? 'bg-[#F4C569] border-[#F4C569] text-[#0B231A]'
                    : 'bg-white/[0.08] border-white/25 text-white hover:border-[#F4C569]'
                }`}
              >
                {copiedLink ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <Share2 size={14} className="text-[#F4C569]" aria-hidden="true" />
                )}
                <span>{copiedLink ? 'تم نسخ الرابط' : 'مشاركة الإعلان'}</span>
              </button>
            </>
          }
          visual={
            <div className="flex flex-col justify-between h-full gap-3">
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/15">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-emerald-100/75">
                    حاسبة الكمية والصفقة التفاعلية
                  </p>
                  <p className="font-display text-sm font-extrabold text-white truncate">
                    احسب التكلفة حسب العدد المطلوب
                  </p>
                </div>
                <span className="font-display text-xs font-extrabold text-[#F4C569] tabular-nums shrink-0">
                  ~{Math.round(listing.priceAmount / Math.max(1, listing.weightKg))} ر.س/كجم
                </span>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-emerald-100/85">
                    العدد المطلوب:
                  </span>
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label="إنقاص العدد"
                      onClick={() => setBannerSimQty((q) => Math.max(1, q - 1))}
                      disabled={bannerSimQty <= 1}
                      className="w-8 h-8 rounded-lg border border-white/20 bg-white/[0.07] hover:border-[#F4C569] disabled:opacity-40 text-white flex items-center justify-center cursor-pointer"
                    >
                      <Minus size={13} aria-hidden="true" />
                    </button>
                    <span className="min-w-[52px] text-center font-display text-base font-extrabold text-[#F4C569] tabular-nums">
                      {bannerSimQty}
                    </span>
                    <button
                      type="button"
                      aria-label="زيادة العدد"
                      onClick={() =>
                        setBannerSimQty((q) => Math.min(Math.max(1, listing.quantity), q + 1))
                      }
                      disabled={bannerSimQty >= Math.max(1, listing.quantity)}
                      className="w-8 h-8 rounded-lg border border-white/20 bg-white/[0.07] hover:border-[#F4C569] disabled:opacity-40 text-white flex items-center justify-center cursor-pointer"
                    >
                      <Plus size={13} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {listing.quantity > 1 && (
                  <input
                    type="range"
                    min={1}
                    max={listing.quantity}
                    value={bannerSimQty}
                    aria-label="تحديد عدد الرؤوس"
                    onChange={(e) => setBannerSimQty(Number(e.target.value))}
                    className="w-full accent-[#F4C569] cursor-pointer"
                  />
                )}

                <div className="p-3 rounded-xl bg-white/[0.06] border border-white/12 flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-emerald-100/80">
                    التكلفة التقديرية ({bannerSimQty} رأس)
                  </span>
                  <span className="font-display text-lg font-extrabold text-[#F4C569] tabular-nums">
                    {formatPriceSar(bannerSimQty * listing.priceAmount)}
                  </span>
                </div>
              </div>

              {!isOwner && listing.status === 'Published' && (
                <div className="grid grid-cols-2 gap-2">
                  {allowsOffers && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!currentUser) {
                          onRequireAuth?.('login');
                          return;
                        }
                        setOfferQuantity(String(bannerSimQty));
                        setShowOfferModal(true);
                      }}
                      className="min-h-[38px] px-3 rounded-xl bg-[#F4C569] hover:bg-[#ffd582] text-[#0B231A] text-xs font-extrabold transition-colors cursor-pointer"
                    >
                      تقديم سوم ({bannerSimQty})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={focusDirectMessageForm}
                    className={`min-h-[38px] px-3 rounded-xl border border-white/20 bg-white/[0.08] hover:border-[#F4C569] text-white text-xs font-bold transition-colors cursor-pointer ${
                      allowsOffers ? '' : 'col-span-2'
                    }`}
                  >
                    مراسلة المربي
                  </button>
                </div>
              )}
            </div>
          }
          interactiveDock={
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href="#listing-comments-section"
                  className="min-h-[32px] px-3 py-1 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/15 hover:border-[#F4C569]/55 text-white font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <MessageSquare size={12} className="text-[#F4C569]" aria-hidden="true" />
                  <span>الأسئلة والتعليقات</span>
                </a>
                {!isOwner && (
                  <button
                    type="button"
                    onClick={focusDirectMessageForm}
                    className="min-h-[32px] px-3 py-1 rounded-xl bg-white/[0.07] hover:bg-white/[0.14] border border-white/15 hover:border-[#F4C569]/55 text-white font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Phone size={12} className="text-[#F4C569]" aria-hidden="true" />
                    <span>تواصل مباشر</span>
                  </button>
                )}
              </div>
              <span className="text-[11px] font-semibold text-emerald-100/80">
                {listing.vaccinated ? '✓ محصّن بشهادة رعاية' : 'معاينة قبل الشراء'} ·{' '}
                {formatRelativeArabicTime(listing.publishedAt)}
              </span>
            </div>
          }
      />

      <div
        className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 ${
          !isOwner && listing.status === 'Published' ? 'pb-24 lg:pb-10' : 'pb-10'
        }`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Right Column in RTL: Gallery + Structured Specs + Negotiation Offers */}
        <div className="lg:col-span-7 space-y-6 min-w-0">
          {/* Media Gallery */}
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden shadow-xs">
            <div
              className="relative aspect-[4/3] w-full bg-[var(--color-cream)] touch-pan-y select-none"
              tabIndex={galleryItems.length > 1 ? 0 : undefined}
              aria-label="معرض صور وفيديو الإعلان"
              onTouchStart={(e) => {
                if (galleryItems.length <= 1 || !e.touches[0]) return;
                galleryTouchRef.current = {
                  x: e.touches[0].clientX,
                  y: e.touches[0].clientY,
                };
              }}
              onTouchEnd={(e) => {
                if (galleryItems.length <= 1 || !galleryTouchRef.current || !e.changedTouches[0]) {
                  galleryTouchRef.current = null;
                  return;
                }
                const dx = e.changedTouches[0].clientX - galleryTouchRef.current.x;
                const dy = e.changedTouches[0].clientY - galleryTouchRef.current.y;
                galleryTouchRef.current = null;
                if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
                if (dx > 0) {
                  setActiveMediaIdx((prev) => (prev + 1) % galleryItems.length);
                } else {
                  setActiveMediaIdx(
                    (prev) => (prev - 1 + galleryItems.length) % galleryItems.length
                  );
                }
              }}
              onKeyDown={(e) => {
                if (galleryItems.length <= 1) return;
                if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  setActiveMediaIdx((prev) => (prev + 1) % galleryItems.length);
                } else if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  setActiveMediaIdx(
                    (prev) => (prev - 1 + galleryItems.length) % galleryItems.length
                  );
                }
              }}
            >
              {activeMedia?.kind === 'video' ? (
                <video
                  key={activeMedia.url}
                  src={activeMedia.url}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-contain bg-black"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  aria-label="تكبير الصورة"
                  className="w-full h-full block cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-gold)]"
                >
                  <SafeImage
                    src={activeMedia?.url}
                    alt={listing.title}
                    width={800}
                    height={597}
                    loading="eager"
                    className="w-full h-full object-cover"
                  />
                </button>
              )}

              {/* Counter & Media Type Indicator */}
              <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-none">
                {galleryItems.length > 1 && (
                  <span className="px-2.5 py-1 rounded-md bg-black/65 backdrop-blur-xs text-white text-xs font-semibold tabular-nums">
                    {safeMediaIdx + 1} / {galleryItems.length}
                  </span>
                )}
                {activeMedia?.kind === 'video' && (
                  <span className="px-2.5 py-1 rounded-md bg-[#0B3A29]/90 text-white text-xs font-semibold inline-flex items-center gap-1">
                    <Play
                      size={11}
                      className="fill-[var(--color-gold)] text-[var(--color-gold)]"
                      aria-hidden="true"
                    />
                    <span>فيديو المعاينة</span>
                  </span>
                )}
              </div>

              {activeMedia?.kind === 'image' && (
                <button
                  ref={zoomBtnRef}
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  aria-label="عرض الصورة بالحجم الكامل"
                  className="absolute top-3 left-3 w-11 h-11 rounded-lg bg-black/55 hover:bg-black/75 text-white flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--color-gold)]"
                >
                  <Maximize2 size={16} aria-hidden="true" />
                </button>
              )}

              {galleryItems.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="الوسيط السابق"
                    onClick={() =>
                      setActiveMediaIdx(
                        (prev) => (prev - 1 + galleryItems.length) % galleryItems.length
                      )
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-11 sm:h-11 rounded-full sm:rounded-lg bg-black/55 hover:bg-black/75 text-white flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--color-gold)]"
                  >
                    <ChevronRight size={20} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="الوسيط التالي"
                    onClick={() =>
                      setActiveMediaIdx((prev) => (prev + 1) % galleryItems.length)
                    }
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-11 sm:h-11 rounded-full sm:rounded-lg bg-black/55 hover:bg-black/75 text-white flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--color-gold)]"
                  >
                    <ChevronLeft size={20} aria-hidden="true" />
                  </button>

                  {/* Mobile Pagination Dots */}
                  <div
                    aria-hidden="true"
                    className="sm:hidden absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/45 backdrop-blur-xs pointer-events-none"
                  >
                    {galleryItems.map((item, idx) => (
                      <span
                        key={item.id}
                        className={`h-1.5 rounded-full transition-all ${
                          idx === safeMediaIdx ? 'w-4 bg-[#F4C569]' : 'w-1.5 bg-white/60'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {galleryItems.length > 1 && (
              <div className="p-3 flex items-center gap-2.5 overflow-x-auto border-t border-[var(--color-border)] bg-[var(--color-surface)]">
                {galleryItems.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveMediaIdx(idx)}
                    aria-current={idx === safeMediaIdx ? 'true' : undefined}
                    aria-label={
                      item.kind === 'video'
                        ? 'تشغيل فيديو الإعلان'
                        : `${listing.title} - صورة ${idx + 1}`
                    }
                    className={`w-20 h-16 rounded-lg overflow-hidden border-2 shrink-0 cursor-pointer relative transition-opacity ${
                      idx === safeMediaIdx
                        ? 'border-[var(--color-green-ink)] ring-2 ring-[var(--color-gold)]/50 opacity-100'
                        : 'border-[var(--color-border)] opacity-75 hover:opacity-100'
                    }`}
                  >
                    {item.kind === 'video' ? (
                      <div className="w-full h-full bg-[#0B3A29] text-white flex flex-col items-center justify-center gap-0.5">
                        <Play
                          size={18}
                          className="fill-[var(--color-gold)] text-[var(--color-gold)]"
                          aria-hidden="true"
                        />
                        <span className="text-[10px] font-bold">فيديو</span>
                      </div>
                    ) : (
                      <SafeImage
                        src={item.url}
                        alt={`${listing.title} - صورة ${idx + 1}`}
                        width={800}
                        height={597}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Structured Specifications & Description */}
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6">
            <div className="flex flex-col items-start gap-2 pb-4 border-b border-[var(--color-border)] sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-display text-lg font-bold text-[var(--color-ink)] text-balance">
                المواصفات التفصيلية للعرض
              </h2>
              {listing.vaccinated && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-green-ink)] shrink-0 whitespace-nowrap">
                  <ShieldCheck size={15} aria-hidden="true" />
                  <span>محصّن بيطرياً</span>
                </span>
              )}
            </div>

            <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-3.5">
              <div className="p-3.5 rounded-xl bg-[var(--color-cream)]/65 border border-[var(--color-border)]/70">
                <dt className="text-xs text-[var(--color-muted)]">التصنيف والسلالة</dt>
                <dd className="mt-1 text-sm font-bold text-[var(--color-ink)]">
                  {category?.name || 'أغنام'} — {breed?.name || 'غير محدد'}
                  {subCategory ? ` (${subCategory.name})` : ''}
                </dd>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--color-cream)]/65 border border-[var(--color-border)]/70">
                <dt className="text-xs text-[var(--color-muted)]">العمر التقريبي</dt>
                <dd className="mt-1 text-sm font-bold text-[var(--color-ink)] tabular-nums">
                  {listing.ageMonths} أشهر
                </dd>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--color-cream)]/65 border border-[var(--color-border)]/70">
                <dt className="text-xs text-[var(--color-muted)]">الوزن التقريبي</dt>
                <dd className="mt-1 text-sm font-bold text-[var(--color-ink)] tabular-nums">
                  {listing.weightKg} كجم
                </dd>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--color-cream)]/65 border border-[var(--color-border)]/70">
                <dt className="text-xs text-[var(--color-muted)]">الجنس / الفئة</dt>
                <dd className="mt-1 text-sm font-bold text-[var(--color-ink)]">{listing.sex}</dd>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--color-cream)]/65 border border-[var(--color-border)]/70">
                <dt className="text-xs text-[var(--color-muted)]">العدد المتاح</dt>
                <dd className="mt-1 text-sm font-bold text-[var(--color-ink)] tabular-nums">
                  {listing.quantity} رأس
                </dd>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--color-cream)]/65 border border-[var(--color-border)]/70">
                <dt className="text-xs text-[var(--color-muted)]">التحصين البيطري</dt>
                <dd className="mt-1 text-sm font-bold text-[var(--color-green-ink)]">
                  {listing.vaccinated ? 'محصّن (دموي ومعوي)' : 'حسب المعاينة'}
                </dd>
              </div>
            </dl>

            <div className="mt-6 pt-5 border-t border-[var(--color-border)]">
              <h3 className="font-display text-base font-bold text-[var(--color-ink)] mb-2.5">
                وصف البائع وملاحظات العرض
              </h3>
              <p className="text-sm text-[var(--color-ink)]/90 leading-relaxed whitespace-pre-line break-words">
                {listing.description}
              </p>
            </div>
          </div>

          {/* Price Offers / Negotiation Log */}
          {allowsOffers && (
            <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--color-border)]">
                <div>
                  <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
                    سجل عروض الأسعار والتفاوض ({listingOffers.length})
                  </h2>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5">
                    عروض السوم المقدمة من المشترين على هذا الإعلان مع حالة رد المربي
                  </p>
                </div>

                {!isOwner && (
                  <button
                    type="button"
                    onClick={handleOpenOfferModal}
                    className="min-h-[40px] px-4 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <BadgeDollarSign size={15} aria-hidden="true" />
                    <span>تقديم عرض سعر</span>
                  </button>
                )}
              </div>

              {listingOffers.length === 0 ? (
                <p className="mt-4 text-sm text-[var(--color-muted)]">
                  لا توجد عروض أسعار مقدمة حتى الآن. كن أول من يقدم سومة للمربي.
                </p>
              ) : (
                <div className="mt-3 divide-y divide-[var(--color-border)]">
                  {listingOffers.map((offer) => (
                    <div
                      key={offer.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center flex-wrap gap-2 text-xs text-[var(--color-muted)]">
                          <span className="font-semibold text-[var(--color-ink)]">
                            {offer.buyerName}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">الكمية: {offer.quantity} رأس</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatRelativeArabicTime(offer.createdAt)}</span>
                        </div>
                        <p className="font-display text-base font-extrabold text-[var(--color-green-ink)] tabular-nums mt-1">
                          {formatPriceSar(offer.offeredPrice)} للرأس
                          <span className="text-xs font-medium text-[var(--color-muted)] mr-2">
                            (الإجمالي: {formatPriceSar(offer.offeredPrice * offer.quantity)})
                          </span>
                        </p>
                        {offer.note && (
                          <p className="text-xs text-[var(--color-muted)] mt-1">{offer.note}</p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <span
                          className={`text-xs font-semibold ${
                            offer.status === 'accepted'
                              ? 'text-[var(--color-green-ink)]'
                              : offer.status === 'rejected'
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-[var(--color-gold)]'
                          }`}
                        >
                          {formatOfferStatus(offer.status)}
                        </span>

                        {canRespondOffers && offer.status === 'pending' && (
                          <div className="flex items-center gap-1.5 mr-1">
                            <button
                              type="button"
                              onClick={() => onRespondToOffer(offer.id, 'accepted')}
                              className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 size={13} aria-hidden="true" />
                              <span>قبول</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onRespondToOffer(offer.id, 'rejected')}
                              className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <XCircle size={13} aria-hidden="true" />
                              <span>رفض</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Left Column in RTL: Sticky Purchase, Contact & Seller Module */}
        <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-20 min-w-0">
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 shadow-xs">
            {/* Unboxed Metadata */}
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-[var(--color-muted)] mb-2.5">
              <span className="font-bold text-[var(--color-green-ink)]">
                حالة الإعلان: {formatStatusLabel(listing.status)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} aria-hidden="true" />
                <span>
                  {region?.name} — {listing.city}
                </span>
              </span>
              <span aria-hidden="true">·</span>
              <span>{formatRelativeArabicTime(listing.publishedAt)}</span>
              {likesEnabled && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums font-medium text-[var(--color-ink)]">
                    {likesCount} إعجاب
                  </span>
                </>
              )}
            </div>

            <h1 className="font-display text-xl sm:text-2xl font-extrabold text-[var(--color-ink)] leading-snug text-balance">
              {listing.title}
            </h1>

            {/* Structured Price & Herd Value Breakdown */}
            <div className="mt-4 p-4 rounded-xl bg-[var(--color-cream)]/75 border border-[var(--color-border)] space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-[var(--color-muted)]">السعر المطلوب للرأس</p>
                  <p className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--color-green-ink)] tabular-nums mt-0.5">
                    {formatPriceSar(listing.priceAmount)}
                    <span className="text-xs font-semibold text-[var(--color-muted)] mr-1.5">
                      / للرأس
                    </span>
                  </p>
                </div>

                {listing.expectedPrice && listing.expectedPrice > 0 && (
                  <div className="text-left">
                    <p className="text-xs text-[var(--color-muted)]">السعر المتوقع للتفاوض للرأس</p>
                    <p className="font-display text-lg font-bold text-[var(--color-ink)] tabular-nums mt-0.5">
                      {formatPriceSar(listing.expectedPrice)}
                    </p>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-[var(--color-border)]/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-[var(--color-ink)] tabular-nums">
                  الكمية المتاحة: {listing.quantity} رأس
                </span>
                {totalHerdValue !== null && (
                  <span className="font-bold text-[var(--color-green-ink)] tabular-nums">
                    إجمالي قيمة القطيع: {formatPriceSar(totalHerdValue)}
                  </span>
                )}
              </div>

              <p className="text-xs font-medium text-[var(--color-muted)]">
                {allowsOffers
                  ? 'ميزة تقديم عرض سعر مفعّلة · يقبل السوم والتفاوض'
                  : listing.isNegotiable
                  ? 'السعر قابل للتفاوض المباشر مع البائع'
                  : 'سعر نهائي محدد من البائع'}
              </p>

              {priceReading && (
                <div className="pt-3 border-t border-[var(--color-border)]/80">
                  <p className="text-sm leading-relaxed text-[var(--color-ink)]">{priceReading.sentence}</p>
                  <div
                    className="relative mt-3 h-1.5 rounded-full bg-[var(--color-border)]"
                    role="img"
                    aria-label={priceReading.sentence}
                  >
                    <span
                      className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-[var(--color-green-ink)] border-2 border-[var(--color-canvas)]"
                      style={{ insetInlineStart: `clamp(0px, calc(${priceReading.marker}% - 7px), calc(100% - 14px))` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs tabular-nums text-[var(--color-muted)]">
                    <span>{formatPriceSar(priceReading.min)}</span>
                    <span>المتوسط {formatPriceSar(priceReading.avg)}</span>
                    <span>{formatPriceSar(priceReading.max)}</span>
                  </div>
                  {onOpenPriceIndex && (
                    <button
                      type="button"
                      onClick={onOpenPriceIndex}
                      className="mt-2 text-xs font-semibold text-[var(--color-green-ink)] hover:underline cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
                    >
                      دليل الأسعار الاسترشادية
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Owner Management Shortcuts (Edit & Mark Sold) */}
            {isOwner && (
              <div className="mt-5 p-4 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-sm font-bold text-[var(--color-ink)]">
                    إدارة إعلانك
                  </p>
                  <span className="text-[11px] font-semibold text-[var(--color-green-ink)]">
                    {formatStatusLabel(listing.status)}
                  </span>
                </div>
                {listing.rejectionReason && (
                  <p className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg p-2.5">
                    سبب الرفض: {listing.rejectionReason}
                  </p>
                )}
                <div className="flex flex-wrap gap-2.5">
                  {onEditListing && (
                    <button
                      type="button"
                      onClick={() => onEditListing(listing)}
                      className="flex-1 min-w-[130px] min-h-[42px] px-4 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Pencil size={14} aria-hidden="true" />
                      <span>تعديل الإعلان</span>
                    </button>
                  )}
                  {onMarkSold && listing.status === 'Published' && (
                    <button
                      type="button"
                      disabled={markingSold}
                      onClick={handleConfirmMarkSold}
                      className="flex-1 min-w-[130px] min-h-[42px] px-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream-hover)] text-[var(--color-ink)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      <CheckCircle2 size={14} aria-hidden="true" />
                      <span>{markingSold ? 'جاري التحديث...' : 'تحديد كمباع'}</span>
                    </button>
                  )}
                </div>
                {!listing.isFeatured &&
                  (listing.status === 'Published' || listing.status === 'Pending') && (
                    <div className="pt-2 border-t border-[var(--color-border)]/70 flex flex-wrap items-center justify-between gap-2 text-xs">
                      {listing.featuredRequested ? (
                        <span className="text-[var(--color-green-ink)] font-semibold inline-flex items-center gap-1.5">
                          <Sparkles size={14} className="text-[var(--color-gold)]" aria-hidden="true" />
                          <span>طلب تمييز الإعلان مسجل — أكمل الحوالة من لوحة حسابي</span>
                        </span>
                      ) : (
                        <>
                          <span className="text-[var(--color-muted)]">
                            تمييز وتثبيت الإعلان ({formatPriceSar(commissionSettings?.featuredWeeklyPriceSar ?? 35)} / أسبوع):
                          </span>
                          <button
                            type="button"
                            disabled={requestingFeature}
                            onClick={handleRequestFeatured}
                            className="min-h-[36px] px-3 rounded-lg border border-[var(--color-gold)]/70 bg-[var(--color-surface)] hover:bg-[var(--color-gold-soft)]/35 text-xs font-bold text-[var(--color-ink)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                          >
                            <Sparkles size={13} className="text-[var(--color-gold)]" aria-hidden="true" />
                            <span>{requestingFeature ? 'جاري الطلب...' : 'طلب تمييز الإعلان'}</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
              </div>
            )}

            {/* Primary Negotiation, Contact & Engagement Buttons */}
            <div className="mt-5 space-y-2.5">
              {allowsOffers && !isOwner && (
                <button
                  type="button"
                  onClick={handleOpenOfferModal}
                  className="w-full h-11 px-4 rounded-lg bg-[var(--color-gold)] hover:bg-[var(--color-gold-hover)] text-[#14261D] text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <BadgeDollarSign size={17} aria-hidden="true" />
                  <span>تقديم عرض سعر للمربي (سوم)</span>
                </button>
              )}
              {offerSuccess && (
                <p className="text-xs font-medium text-[var(--color-green-ink)] bg-[var(--color-cream)] border border-[var(--color-border)] rounded-lg px-3 py-2">
                  تم تسجيل عرض سعرك وإشعار المربي به، ويمكنك متابعة الرد في سجل العروض أو من لوحة حسابي.
                </p>
              )}

              {/* Visitor Login/Register CTA for contacting seller */}
              {!currentUser && (
                <div className="p-4 rounded-xl bg-[var(--color-cream)] border border-[var(--color-border)] space-y-2.5">
                  <p className="text-xs font-bold text-[var(--color-ink)]">
                    تواصل مع البائع وأظهر رقم الجوال أو الواتساب
                  </p>
                  <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
                    للحفاظ على خصوصية المربين، تتاح أرقام الاتصال والمراسلة المباشرة للأعضاء المسجلين فقط.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onRequireAuth?.('login')}
                      className="flex-1 min-w-[140px] min-h-[42px] px-4 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <LogIn size={14} aria-hidden="true" />
                      <span>تسجيل الدخول للتواصل</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRequireAuth?.('register')}
                      className="min-h-[42px] px-3.5 rounded-lg border border-[var(--color-green-ink)] text-[var(--color-green-ink)] hover:bg-[var(--color-surface)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <UserPlus size={14} aria-hidden="true" />
                      <span>حساب جديد</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Authenticated Buyer Telephone & WhatsApp Actions (on-demand via /contact) */}
              {currentUser && !isOwner && (
                <div className="space-y-2">
                  {listing.status !== 'Published' ? (
                    <p className="text-xs text-[var(--color-muted)] bg-[var(--color-cream)]/60 border border-[var(--color-border)] rounded-lg px-3 py-2.5">
                      بيانات الاتصال المباشر متاحة فقط للإعلانات المنشورة.
                    </p>
                  ) : seller?.contactAvailable === false ? (
                    <p className="text-xs text-[var(--color-muted)] bg-[var(--color-cream)]/60 border border-[var(--color-border)] rounded-lg px-3 py-2.5">
                      لا تتوفر بيانات التواصل المباشر لهذا الحساب حالياً، يمكنك المتابعة عبر رسائل المنصة.
                    </p>
                  ) : !revealedContact ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled={revealingContact}
                        onClick={handleRevealContact}
                        className="w-full h-11 px-4 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                      >
                        <Phone size={16} aria-hidden="true" />
                        <span>{revealingContact ? 'جاري التحقق وإظهار الرقم...' : 'إظهار رقم البائع والتواصل'}</span>
                      </button>
                      {contactError && (
                        <p
                          role="alert"
                          className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
                        >
                          {contactError}
                        </p>
                      )}
                    </div>
                  ) : contactLinks.phoneDisplay || contactLinks.whatsappHref ? (
                    <div className="flex flex-wrap gap-2">
                      {contactLinks.phoneDisplay && (
                        <button
                          type="button"
                          onClick={() => setShowPhone((p) => !p)}
                          aria-expanded={showPhone}
                          className="flex-1 min-w-[145px] h-11 px-4 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                        >
                          <Phone size={16} aria-hidden="true" />
                          <span className="tabular-nums" dir={showPhone ? 'ltr' : 'rtl'}>
                            {showPhone ? contactLinks.phoneDisplay : 'إظهار رقم البائع'}
                          </span>
                        </button>
                      )}

                      {contactLinks.telHref && (
                        <a
                          href={contactLinks.telHref}
                          aria-label={`اتصال هاتفي بالبائع ${seller?.displayName || ''}`}
                          className="h-11 px-4 rounded-lg border border-[var(--color-green-ink)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] text-[var(--color-green-ink)] text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                        >
                          <Phone size={15} aria-hidden="true" />
                          <span>اتصال</span>
                        </a>
                      )}

                      {contactLinks.whatsappHref && (
                        <a
                          href={contactLinks.whatsappHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`مراسلة البائع ${seller?.displayName || ''} عبر واتساب`}
                          className="h-11 px-4 rounded-lg border border-[var(--color-green-ink)] bg-[var(--color-cream)] hover:bg-[var(--color-cream-hover)] text-[var(--color-green-ink)] text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="w-4 h-4 fill-current shrink-0"
                            aria-hidden="true"
                          >
                            <path d="M12.04 2a9.93 9.93 0 0 0-8.5 15.05L2 22l5.1-1.34A9.93 9.93 0 1 0 12.04 2Zm5.78 14.08c-.24.68-1.4 1.3-1.94 1.38-.5.07-1.13.1-1.82-.12-.42-.14-.96-.32-1.65-.62-2.9-1.25-4.79-4.18-4.93-4.37-.14-.2-1.18-1.57-1.18-3 0-1.42.74-2.12 1-2.41.27-.29.58-.36.77-.36h.56c.18 0 .42-.07.66.5.24.58.82 2 .9 2.14.07.14.12.31.02.5-.1.2-.15.32-.29.49-.15.17-.3.38-.44.51-.14.15-.3.3-.13.59.17.29.75 1.24 1.61 2.01 1.11.99 2.04 1.3 2.33 1.44.29.15.46.12.63-.07.17-.2.72-.84.91-1.13.2-.29.39-.24.65-.15.27.1 1.68.8 1.97.94.29.15.48.22.55.34.07.12.07.7-.17 1.38Z" />
                          </svg>
                          <span>واتساب البائع</span>
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--color-muted)] bg-[var(--color-cream)]/60 border border-[var(--color-border)] rounded-lg px-3 py-2.5">
                      يمكنك التواصل المباشر مع البائع عبر رسائل المنصة أدناه.
                    </p>
                  )}
                </div>
              )}

              {/* Engagement Row: Separate Like, Favorite & Compare */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  disabled={!likesEnabled || !onToggleLike}
                  aria-pressed={isLiked}
                  title={
                    !likesEnabled
                      ? 'الإعجاب متاح فقط بعد نشر الإعلان'
                      : isLiked
                      ? 'إلغاء الإعجاب'
                      : 'الإعجاب بالإعلان'
                  }
                  onClick={() => onToggleLike?.(listing.id)}
                  className={`h-11 px-2.5 rounded-lg border text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-all duration-150 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                    isLiked
                      ? 'bg-[var(--color-cream)] border-[var(--color-green-ink)] text-[var(--color-green-ink)]'
                      : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-ink)] hover:bg-[var(--color-cream)]'
                  }`}
                >
                  <ThumbsUp
                    size={15}
                    aria-hidden="true"
                    className={isLiked ? 'fill-[var(--color-gold)] text-[var(--color-green-ink)]' : ''}
                  />
                  <span>{isLiked ? 'أعجبني' : 'إعجاب'}</span>
                  <span className="tabular-nums font-bold">({likesCount})</span>
                </button>

                <button
                  type="button"
                  aria-pressed={isFavorite}
                  onClick={() => onToggleFavorite(listing.id)}
                  className={`h-11 px-2.5 rounded-lg border text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    isFavorite
                      ? 'bg-[var(--color-cream)] border-[var(--color-gold)] text-[var(--color-green-ink)]'
                      : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-ink)] hover:bg-[var(--color-cream)]'
                  }`}
                >
                  <Heart size={15} fill={isFavorite ? 'var(--color-gold)' : 'none'} aria-hidden="true" />
                  <span>{isFavorite ? 'في المفضلة' : 'حفظ'}</span>
                </button>

                <button
                  type="button"
                  aria-pressed={isInCompare}
                  onClick={() => onToggleCompare(listing.id)}
                  className={`h-11 px-2.5 rounded-lg border text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    isInCompare
                      ? 'bg-[var(--color-cream)] border-[var(--color-green-ink)] text-[var(--color-green-ink)]'
                      : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-ink)] hover:bg-[var(--color-cream)]'
                  }`}
                >
                  <Scale size={15} aria-hidden="true" />
                  <span>{isInCompare ? 'بالمقارنة' : 'مقارنة'}</span>
                </button>
              </div>

              {compareListings.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    compareSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                  className="text-xs font-semibold text-[var(--color-green-ink)] hover:underline inline-flex items-center gap-1.5 cursor-pointer pt-1"
                >
                  <Scale size={13} aria-hidden="true" />
                  <span className="tabular-nums">
                    عرض جدول مقارنة المواشي ({compareListings.length} / 4)
                  </span>
                </button>
              )}
            </div>

            {/* Share Listing Bar */}
            <div className="mt-5 pt-4 border-t border-[var(--color-border)]">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ink)]">
                  <Share2 size={14} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                  <span>مشاركة الإعلان</span>
                </span>
                <span className="text-[11px] text-[var(--color-muted)]">
                  انسخ الرابط أو شاركه مباشرة
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {supportsNativeShare && (
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    className="h-10 px-3.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Share2 size={14} aria-hidden="true" />
                    <span>مشاركة عبر الجهاز</span>
                  </button>
                )}

                <a
                  href={sharePayload.whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="مشاركة الإعلان عبر واتساب"
                  className="h-10 px-3.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] text-xs font-semibold text-[var(--color-green-ink)] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-3.5 h-3.5 fill-current"
                    aria-hidden="true"
                  >
                    <path d="M12.04 2a9.93 9.93 0 0 0-8.5 15.05L2 22l5.1-1.34A9.93 9.93 0 1 0 12.04 2Zm5.78 14.08c-.24.68-1.4 1.3-1.94 1.38-.5.07-1.13.1-1.82-.12-.42-.14-.96-.32-1.65-.62-2.9-1.25-4.79-4.18-4.93-4.37-.14-.2-1.18-1.57-1.18-3 0-1.42.74-2.12 1-2.41.27-.29.58-.36.77-.36h.56c.18 0 .42-.07.66.5.24.58.82 2 .9 2.14.07.14.12.31.02.5-.1.2-.15.32-.29.49-.15.17-.3.38-.44.51-.14.15-.3.3-.13.59.17.29.75 1.24 1.61 2.01 1.11.99 2.04 1.3 2.33 1.44.29.15.46.12.63-.07.17-.2.72-.84.91-1.13.2-.29.39-.24.65-.15.27.1 1.68.8 1.97.94.29.15.48.22.55.34.07.12.07.7-.17 1.38Z" />
                  </svg>
                  <span>واتساب</span>
                </a>

                <button
                  type="button"
                  onClick={handleCopyShareLink}
                  className={`h-10 px-3.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    copiedLink
                      ? 'bg-[var(--color-cream)] border-[var(--color-green-ink)] text-[var(--color-green-ink)]'
                      : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-ink)] hover:bg-[var(--color-cream)]'
                  }`}
                >
                  {copiedLink ? (
                    <Check size={14} aria-hidden="true" />
                  ) : (
                    <Copy size={14} aria-hidden="true" />
                  )}
                  <span>{copiedLink ? 'تم نسخ الرابط' : 'نسخ الرابط'}</span>
                </button>

                <a
                  href={sharePayload.twitterHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="مشاركة الإعلان عبر تويتر X"
                  className="h-10 px-3.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] text-xs font-semibold text-[var(--color-ink)] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-3.5 h-3.5 fill-current"
                    aria-hidden="true"
                  >
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  <span>تويتر (X)</span>
                </a>
              </div>

              {manualShareUrlVisible && (
                <div className="mt-2.5 flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={sharePayload.url}
                    aria-label="رابط الإعلان للنسخ اليدوي"
                    onFocus={(e) => e.currentTarget.select()}
                    dir="ltr"
                    className="flex-1 h-9 px-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]/60 text-xs text-[var(--color-ink)] tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => setManualShareUrlVisible(false)}
                    className="h-9 px-2.5 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)] cursor-pointer"
                  >
                    إغلاق
                  </button>
                </div>
              )}
            </div>

            {/* Direct Message Form (Authenticated Non-Owners Only) */}
            {currentUser && !isOwner && (
              <form
                onSubmit={handleSendMessage}
                className="mt-6 pt-5 border-t border-[var(--color-border)]"
              >
                <label
                  htmlFor="direct-msg"
                  className="block text-sm font-semibold text-[var(--color-ink)] mb-2"
                >
                  تواصل مباشر عبر رسائل المنصة
                </label>
                <textarea
                  ref={directMsgRef}
                  id="direct-msg"
                  rows={3}
                  value={messageText}
                  onChange={(e) => {
                    setMessageText(e.target.value);
                    if (msgError) setMsgError('');
                  }}
                  className="w-full p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]/50 text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                />
                <button
                  type="submit"
                  disabled={sendingMsg}
                  className="mt-2.5 w-full h-11 rounded-lg border border-[var(--color-green-ink)] text-[var(--color-green-ink)] hover:bg-[var(--color-green)] hover:text-white hover:border-[var(--color-green)] text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <MessageSquare size={16} aria-hidden="true" />
                  <span>{sendingMsg ? 'جاري الإرسال...' : 'إرسال رسالة للبائع'}</span>
                </button>
                {msgError && (
                  <p
                    role="alert"
                    className="mt-2 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
                  >
                    {msgError}
                  </p>
                )}
                {msgSuccess && (
                  <p className="mt-2 text-xs font-medium text-[var(--color-green-ink)]">
                    تم إرسال رسالتك بنجاح. يمكنك متابعة الرد من تبويب «المحادثات» في حسابي.
                  </p>
                )}
              </form>
            )}
          </div>

          {/* Seller Trust Card */}
          {seller && (
            <div className="bg-[var(--color-cream)] rounded-2xl border border-[var(--color-border)] p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-[var(--color-green)] text-white flex items-center justify-center shrink-0">
                    <UserIcon size={20} aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenSellerProfile(seller.userId)}
                      className="font-display text-base font-bold text-[var(--color-ink)] hover:text-[var(--color-green-ink)] hover:underline text-right cursor-pointer truncate max-w-full block"
                    >
                      {seller.displayName}
                    </button>
                    <p className="text-xs text-[var(--color-muted)] mt-0.5">
                      {seller.city} · خبرة {seller.yearsExperience} سنة
                    </p>
                  </div>
                </div>
                {isSellerVerified(seller) ? (
                  <VerifiedSellerBadge variant="badge" />
                ) : (
                  <span className="text-[11px] font-medium text-[var(--color-muted)] shrink-0">
                    حساب مسجّل
                  </span>
                )}
              </div>

              {seller.bio && (
                <p className="mt-3 text-xs text-[var(--color-muted)] leading-relaxed">
                  {seller.bio}
                </p>
              )}

              <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs text-[var(--color-muted)] tabular-nums">
                  {(seller.ratingCount ?? 0) > 0
                    ? `التقييم: ${seller.rating} / 5 (${seller.ratingCount})`
                    : 'حساب مربي بالسوق'}{' '}
                  · إتمام {seller.totalSales} بيعة
                </span>
                <button
                  type="button"
                  onClick={() => onOpenSellerProfile(seller.userId)}
                  className="text-xs font-semibold text-[var(--color-green-ink)] hover:underline cursor-pointer"
                >
                  عرض ملف المربي وإعلاناته
                </button>
              </div>
            </div>
          )}

          {/* Report Violation Trigger (Hidden for listing owner) */}
          {!isOwner && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (!currentUser) {
                    onRequireAuth?.('login');
                    return;
                  }
                  setReportError('');
                  setShowReportModal(true);
                }}
                className="min-h-[36px] px-2 rounded-lg inline-flex items-center gap-1.5 text-xs text-[var(--color-muted)] hover:text-red-700 dark:hover:text-red-400 hover:bg-[var(--color-cream)] transition-colors cursor-pointer"
              >
                <Flag size={13} aria-hidden="true" />
                <span>إبلاغ عن مخالفة في هذا الإعلان</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Public Questions & Comments Section */}
      <ListingCommentsSection
        listing={listing}
        currentUser={currentUser}
        refreshSignal={commentRefreshSignal}
        targetCommentId={targetCommentId}
        onRequireAuth={() => onRequireAuth?.('login')}
        onNotify={onNotify}
      />

      {/* Livestock Comparison Section */}
      <div
        id="livestock-compare-section"
        ref={compareSectionRef}
        className="mt-8 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4 sm:p-6 space-y-5"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[var(--color-border)]">
          <div>
            <div className="flex items-center gap-2 text-[var(--color-green-ink)]">
              <Scale size={18} aria-hidden="true" />
              <h2 className="font-display text-lg sm:text-xl font-bold text-[var(--color-ink)]">
                مقارنة المواشي ({compareListings.length} / 4)
              </h2>
            </div>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              أضف أكثر من إعلان لمقارنة السعر والوزن والسلالة والتحصين والموقع في جدول واحد واضح لمساعدتك في اتخاذ القرار.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {compareIds.length < 4 && availableToCompare.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <select
                  aria-label="اختر إعلاناً لإضافته إلى المقارنة"
                  value={comparePickId}
                  onChange={(e) => setComparePickId(e.target.value)}
                  className="h-10 w-full sm:w-auto sm:max-w-[260px] min-w-0 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                >
                  {availableToCompare.map((item) => {
                    const itemBreed = allBreeds.find((b) => b.id === item.breedId);
                    return (
                      <option key={item.id} value={item.id}>
                        {itemBreed?.name ? `${itemBreed.name} — ` : ''}
                        {item.title.slice(0, 34)} ({formatPriceSar(item.priceAmount)})
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  disabled={!comparePickId}
                  onClick={() => {
                    if (comparePickId) onToggleCompare(comparePickId);
                  }}
                  className="h-10 px-3.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <Plus size={14} aria-hidden="true" />
                  <span>إضافة للمقارنة</span>
                </button>
              </div>
            )}

            {compareListings.length >= 2 && (
              <button
                type="button"
                aria-pressed={showDiffsOnly}
                onClick={() => setShowDiffsOnly((prev) => !prev)}
                className={`h-10 px-3.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showDiffsOnly
                    ? 'bg-[var(--color-cream)] border-[var(--color-green-ink)] text-[var(--color-green-ink)]'
                    : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-ink)] hover:bg-[var(--color-cream)]'
                }`}
              >
                {showDiffsOnly ? 'عرض جميع المواصفات' : 'إبراز الفروقات فقط'}
              </button>
            )}

            {compareListings.length > 0 && (
              <button
                type="button"
                onClick={onClearCompare}
                className="h-10 px-3.5 rounded-lg border border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted)] hover:text-red-700 dark:hover:text-red-400 hover:bg-[var(--color-cream)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Trash2 size={14} aria-hidden="true" />
                <span>مسح القائمة</span>
              </button>
            )}
          </div>
        </div>

        {compareListings.length === 0 ? (
          <div className="py-8 px-6 text-center rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/40">
            <p className="font-display text-base font-bold text-[var(--color-ink)]">
              قائمة مقارنة المواشي فارغة حالياً
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted)] max-w-lg mx-auto leading-relaxed">
              ابدأ بإضافة هذا الإعلان إلى قائمة المقارنة ثم أضف إعلانات أخرى من القائمة أعلاه أو أثناء تصفح الإعلانات لمشاهدة جدول الفروقات.
            </p>
            <button
              type="button"
              onClick={() => onToggleCompare(listing.id)}
              className="mt-4 h-10 px-5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Scale size={14} aria-hidden="true" />
              <span>إضافة هذا الإعلان للمقارنة</span>
            </button>
          </div>
        ) : (
          (() => {
            const minPrice = Math.min(...compareListings.map((i) => i.priceAmount));
            const maxWeight = Math.max(...compareListings.map((i) => i.weightKg));
            const perKgValues = compareListings
              .filter((i) => i.weightKg > 0)
              .map((i) => Math.round(i.priceAmount / i.weightKg));
            const minPerKg = perKgValues.length > 0 ? Math.min(...perKgValues) : null;

            const comparisonRows: Array<{
              key: string;
              label: string;
              getValue: (item: Listing) => string;
              renderCell: (item: Listing) => ReactNode;
            }> = [
              {
                key: 'price',
                label: 'السعر المطلوب للرأس',
                getValue: (item) => String(item.priceAmount),
                renderCell: (item) => (
                  <div>
                    <span className="font-display text-base font-extrabold text-[var(--color-green-ink)] tabular-nums">
                      {formatPriceSar(item.priceAmount)}
                    </span>
                    {compareListings.length >= 2 && item.priceAmount === minPrice && (
                      <span className="block text-[11px] font-semibold text-[var(--color-green-ink)] mt-0.5">
                        الأقل سعراً
                      </span>
                    )}
                  </div>
                ),
              },
              {
                key: 'expectedPrice',
                label: 'السعر المتوقع / السوم',
                getValue: (item) => (item.expectedPrice ? String(item.expectedPrice) : '-'),
                renderCell: (item) => (
                  <span className="tabular-nums font-semibold text-[var(--color-ink)]">
                    {item.expectedPrice ? formatPriceSar(item.expectedPrice) : '—'}
                  </span>
                ),
              },
              {
                key: 'pricePerKg',
                label: 'التكلفة التقديرية للكيلو',
                getValue: (item) =>
                  item.weightKg > 0 ? String(Math.round(item.priceAmount / item.weightKg)) : '-',
                renderCell: (item) => {
                  const perKg = item.weightKg > 0 ? Math.round(item.priceAmount / item.weightKg) : 0;
                  return (
                    <div>
                      <span className="tabular-nums font-semibold text-[var(--color-ink)]">
                        {perKg > 0 ? `${perKg.toLocaleString('en-US')} ر.س / كجم` : '—'}
                      </span>
                      {compareListings.length >= 2 && minPerKg !== null && perKg === minPerKg && (
                        <span className="block text-[11px] font-semibold text-[var(--color-green-ink)] mt-0.5">
                          أفضل قيمة للوزن
                        </span>
                      )}
                    </div>
                  );
                },
              },
              {
                key: 'breed',
                label: 'السلالة والتصنيف',
                getValue: (item) => {
                  const b = allBreeds.find((x) => x.id === item.breedId)?.name || '';
                  const c = allCategories.find((x) => x.id === item.categoryId)?.name || '';
                  const sc = allCategories.find((x) => x.id === item.subCategoryId)?.name || '';
                  return `${b}|${c}|${sc}`;
                },
                renderCell: (item) => {
                  const b = allBreeds.find((x) => x.id === item.breedId);
                  const c = allCategories.find((x) => x.id === item.categoryId);
                  const sc = allCategories.find((x) => x.id === item.subCategoryId);
                  return (
                    <div className="space-y-0.5">
                      <p className="font-semibold text-[var(--color-ink)]">
                        {b?.name || 'غير محدد'}
                      </p>
                      <p className="text-xs text-[var(--color-muted)]">
                        {c?.name || 'أغنام'}
                        {sc ? ` · ${sc.name}` : ''}
                      </p>
                    </div>
                  );
                },
              },
              {
                key: 'weight',
                label: 'الوزن التقريبي',
                getValue: (item) => String(item.weightKg),
                renderCell: (item) => (
                  <div>
                    <span className="tabular-nums font-bold text-[var(--color-ink)]">
                      {item.weightKg} كجم
                    </span>
                    {compareListings.length >= 2 && item.weightKg === maxWeight && (
                      <span className="block text-[11px] font-semibold text-[var(--color-green-ink)] mt-0.5">
                        الأعلى وزناً
                      </span>
                    )}
                  </div>
                ),
              },
              {
                key: 'age',
                label: 'العمر التقريبي',
                getValue: (item) => String(item.ageMonths),
                renderCell: (item) => (
                  <span className="tabular-nums text-[var(--color-ink)]">
                    {item.ageMonths} أشهر
                  </span>
                ),
              },
              {
                key: 'sex',
                label: 'الجنس',
                getValue: (item) => item.sex,
                renderCell: (item) => <span className="text-[var(--color-ink)]">{item.sex}</span>,
              },
              {
                key: 'quantity',
                label: 'العدد المتاح',
                getValue: (item) => String(item.quantity),
                renderCell: (item) => (
                  <span className="tabular-nums text-[var(--color-ink)]">
                    {item.quantity} رأس
                  </span>
                ),
              },
              {
                key: 'vaccinated',
                label: 'التحصين البيطري',
                getValue: (item) => String(item.vaccinated),
                renderCell: (item) => (
                  <span
                    className={
                      item.vaccinated
                        ? 'font-semibold text-[var(--color-green-ink)]'
                        : 'text-[var(--color-muted)]'
                    }
                  >
                    {item.vaccinated ? 'محصّن (دموي ومعوي)' : 'حسب المعاينة'}
                  </span>
                ),
              },
              {
                key: 'negotiation',
                label: 'التفاوض وعروض السعر',
                getValue: (item) => {
                  const offersOn =
                    item.allowPriceOffers !== undefined
                      ? item.allowPriceOffers
                      : item.isNegotiable;
                  return `${offersOn}|${item.isNegotiable}`;
                },
                renderCell: (item) => {
                  const offersOn =
                    item.allowPriceOffers !== undefined
                      ? item.allowPriceOffers
                      : item.isNegotiable;
                  return (
                    <span className="text-[var(--color-ink)]">
                      {offersOn
                        ? 'يقبل عروض السعر (سوم)'
                        : item.isNegotiable
                        ? 'قابل للتفاوض'
                        : 'سعر نهائي'}
                    </span>
                  );
                },
              },
              {
                key: 'location',
                label: 'المنطقة والمدينة',
                getValue: (item) => `${item.regionId}|${item.city}`,
                renderCell: (item) => {
                  const reg = allRegions.find((r) => r.id === item.regionId);
                  return (
                    <span className="text-[var(--color-ink)]">
                      {reg?.name ? `${reg.name} — ${item.city}` : item.city}
                    </span>
                  );
                },
              },
              {
                key: 'seller',
                label: 'المربي والتقييم',
                getValue: (item) => item.sellerId,
                renderCell: (item) => {
                  const s = allSellers.find((x) => x.userId === item.sellerId);
                  if (!s) return <span className="text-[var(--color-muted)]">—</span>;
                  return (
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenSellerProfile(s.userId)}
                          className="font-semibold text-[var(--color-green-ink)] hover:underline text-right cursor-pointer"
                        >
                          {s.displayName}
                        </button>
                        {isSellerVerified(s) && <VerifiedSellerBadge variant="compact" />}
                      </div>
                      <p className="text-xs text-[var(--color-muted)] tabular-nums mt-0.5">
                        {(s.ratingCount ?? 0) > 0 ? `التقييم: ${s.rating.toFixed(1)} / 5 · ` : ''}
                        {s.totalSales} بيعة
                      </p>
                    </div>
                  );
                },
              },
            ];

            const visibleRows =
              showDiffsOnly && compareListings.length >= 2
                ? comparisonRows.filter((row) => {
                    const values = compareListings.map((item) => row.getValue(item));
                    return new Set(values).size > 1;
                  })
                : comparisonRows;

            return (
              <div className="space-y-3">
                {compareListings.length === 1 && (
                  <p className="text-xs text-[var(--color-muted)] bg-[var(--color-cream)]/60 border border-[var(--color-border)] rounded-lg px-4 py-2.5">
                    تمت إضافة إعلان واحد إلى المقارنة. اختر إعلاناً آخر من القائمة أعلاه لإظهار الفروقات جنباً إلى جنب.
                  </p>
                )}

                <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
                  <table className="w-full text-right text-sm border-collapse min-w-[640px]">
                    <thead>
                      <tr className="bg-[var(--color-cream)]/70 border-b border-[var(--color-border)] align-top">
                        <th className="py-4 px-4 text-xs font-bold text-[var(--color-muted)] w-44 min-w-[160px] sticky right-0 bg-[var(--color-cream)] z-10 border-l border-[var(--color-border)]">
                          مواصفات المقارنة
                        </th>
                        {compareListings.map((item) => {
                          const itemBreed = allBreeds.find((b) => b.id === item.breedId);
                          const thumbUrl = item.images[0]?.url || itemBreed?.imageUrl;
                          const isCurrent = item.id === listing.id;
                          return (
                            <th
                              key={item.id}
                              className="py-4 px-4 min-w-[200px] max-w-[260px] font-normal align-top"
                            >
                              <div className="space-y-2.5">
                                <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden bg-[var(--color-surface)] border border-[var(--color-border)]">
                                  <SafeImage
                                    src={thumbUrl}
                                    alt={item.title}
                                    width={800}
                                    height={597}
                                    className="w-full h-full object-cover"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => onToggleCompare(item.id)}
                                    aria-label={`إزالة ${item.title} من المقارنة`}
                                    className="absolute top-2 left-2 w-11 h-11 sm:w-8 sm:h-8 rounded-md bg-[var(--color-surface)]/90 hover:bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-ink)] flex items-center justify-center cursor-pointer"
                                  >
                                    <X size={14} aria-hidden="true" />
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => onSelectListing(item)}
                                  className="font-display text-sm font-bold text-[var(--color-ink)] hover:text-[var(--color-green-ink)] text-right leading-snug line-clamp-2 cursor-pointer"
                                >
                                  {item.title}
                                </button>

                                {isCurrent ? (
                                  <span className="block text-[11px] font-semibold text-[var(--color-green-ink)]">
                                    الإعلان المعروض حالياً
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => onSelectListing(item)}
                                    className="text-xs font-semibold text-[var(--color-green-ink)] hover:underline cursor-pointer"
                                  >
                                    فتح صفحة الإعلان
                                  </button>
                                )}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
                      {visibleRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={compareListings.length + 1}
                            className="py-6 px-4 text-center text-xs text-[var(--color-muted)]"
                          >
                            جميع المواصفات الأساسية متطابقة بين الإعلانات المختارة.
                          </td>
                        </tr>
                      ) : (
                        visibleRows.map((row) => (
                          <tr key={row.key} className="hover:bg-[var(--color-cream)]/30">
                            <th
                              scope="row"
                              className="py-3.5 px-4 text-xs font-semibold text-[var(--color-muted)] sticky right-0 bg-[var(--color-cream)]/95 z-10 border-l border-[var(--color-border)]"
                            >
                              {row.label}
                            </th>
                            {compareListings.map((item) => (
                              <td key={item.id} className="py-3.5 px-4 text-xs align-top">
                                {row.renderCell(item)}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()
        )}
      </div>

      {/* Related Listings from Existing Comparable Marketplace Data */}
      {relatedListings.length > 0 && (
        <section
          aria-labelledby="related-listings-heading"
          className="mt-10 pt-8 border-t border-[var(--color-border)]"
        >
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
            <div>
              <h2
                id="related-listings-heading"
                className="font-display text-xl sm:text-2xl font-extrabold text-[var(--color-ink)]"
              >
                عروض مشابهة قد تهمك
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-[var(--color-muted)]">
                إعلانات متاحة من نفس السلالة أو التصنيف للمقارنة والشراء المباشر
              </p>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="text-xs sm:text-sm font-semibold text-[var(--color-green-ink)] hover:underline cursor-pointer self-start sm:self-auto"
            >
              تصفح جميع الإعلانات
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {relatedListings.map((item) => (
              <ListingCard
                key={item.id}
                listing={item}
                category={allCategories.find((c) => c.id === item.categoryId)}
                breed={allBreeds.find((b) => b.id === item.breedId)}
                subCategory={allCategories.find((c) => c.id === item.subCategoryId)}
                region={allRegions.find((r) => r.id === item.regionId)}
                seller={allSellers.find((s) => s.userId === item.sellerId)}
                isFavorite={favoriteIds.includes(item.id)}
                isLiked={likedListingIds.includes(item.id)}
                onSelect={onSelectListing}
                onSelectSeller={onOpenSellerProfile}
                onToggleFavorite={onToggleFavorite}
                onToggleLike={onToggleLike}
              />
            ))}
          </div>
        </section>
      )}

      {/* Compact Mobile Sticky Action Bar for Permitted Buyer/Visitor Actions */}
      {!isOwner && listing.status === 'Published' && (
        <div
          className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur-md shadow-[0_-8px_24px_-12px_rgba(11,58,41,0.2)] pb-[max(0.5rem,env(safe-area-inset-bottom))]"
          aria-label="إجراءات التواصل السريعة"
        >
          <div
            aria-hidden="true"
            className="h-[2px] w-full bg-gradient-to-l from-transparent via-[var(--color-gold)]/55 to-transparent"
          />
          <div className="max-w-7xl mx-auto px-3 pt-2 flex items-center justify-between gap-2.5">
            <div className="min-w-0">
              <p className="font-display text-base font-extrabold text-[var(--color-green-ink)] tabular-nums truncate">
                {formatPriceSar(listing.priceAmount)}
              </p>
              <p className="text-[11px] text-[var(--color-muted)] tabular-nums truncate">
                للرأس · {listing.quantity} رأس
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!currentUser ? (
                <button
                  type="button"
                  onClick={() => onRequireAuth?.('login')}
                  className="min-h-[44px] px-4 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <LogIn size={14} aria-hidden="true" />
                  <span>تسجيل الدخول للتواصل</span>
                </button>
              ) : (
                <>
                  {allowsOffers && (
                    <button
                      type="button"
                      onClick={handleOpenOfferModal}
                      className="min-h-[44px] px-3.5 rounded-lg bg-[var(--color-gold)] hover:bg-[var(--color-gold-hover)] text-[#14261D] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <BadgeDollarSign size={14} aria-hidden="true" />
                      <span>تقديم سوم</span>
                    </button>
                  )}

                  {contactLinks.whatsappHref ? (
                    <a
                      href={contactLinks.whatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[44px] px-3.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <span>واتساب</span>
                    </a>
                  ) : contactLinks.telHref ? (
                    <a
                      href={contactLinks.telHref}
                      className="min-h-[44px] px-3.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Phone size={14} aria-hidden="true" />
                      <span>اتصال</span>
                    </a>
                  ) : seller?.contactAvailable !== false && !revealedContact ? (
                    <button
                      type="button"
                      disabled={revealingContact}
                      onClick={handleRevealContact}
                      className="min-h-[44px] px-3.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      <Phone size={14} aria-hidden="true" />
                      <span>{revealingContact ? 'جاري التحقق...' : 'إظهار الرقم'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={focusDirectMessageForm}
                      className="min-h-[44px] px-3.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <MessageSquare size={14} aria-hidden="true" />
                      <span>مراسلة البائع</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Price Offer Modal */}
      <Modal
        open={showOfferModal}
        onClose={() => setShowOfferModal(false)}
        title="تقديم عرض سعر للمربي"
        subtitle={`السعر المطلوب: ${formatPriceSar(listing.priceAmount)}${
          listing.expectedPrice ? ` · السعر المتوقع: ${formatPriceSar(listing.expectedPrice)}` : ''
        }`}
        size="md"
      >
        <form onSubmit={handleOfferSubmit} className="space-y-4">
          {offerError && (
            <p className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
              {offerError}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="offer-price"
                className="block text-xs font-medium text-[var(--color-muted)] mb-1"
              >
                السعر المقترح للرأس (ر.س)
              </label>
              <input
                id="offer-price"
                type="number"
                min="100"
                value={offeredPrice}
                onChange={(e) => setOfferedPrice(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] tabular-nums"
              />
            </div>

            <div>
              <label
                htmlFor="offer-qty"
                className="block text-xs font-medium text-[var(--color-muted)] mb-1"
              >
                الكمية المطلوبة (بحد أقصى {listing.quantity})
              </label>
              <input
                id="offer-qty"
                type="number"
                min="1"
                max={listing.quantity}
                value={offerQuantity}
                onChange={(e) => setOfferQuantity(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] tabular-nums"
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[var(--color-cream)] border border-[var(--color-border)] flex items-center justify-between text-xs">
            <span className="text-[var(--color-muted)]">إجمالي قيمة العرض:</span>
            <span className="font-display text-base font-extrabold text-[var(--color-green-ink)] tabular-nums">
              {formatPriceSar(offerTotal)}
            </span>
          </div>

          <div>
            <label
              htmlFor="offer-note"
              className="block text-xs font-medium text-[var(--color-muted)] mb-1"
            >
              ملاحظات للمربي (اختياري)
            </label>
            <textarea
              id="offer-note"
              rows={3}
              value={offerNote}
              onChange={(e) => setOfferNote(e.target.value)}
              placeholder="مثال: الشراء نقداً بعد المعاينة أو طلب التوصيل..."
              className="w-full p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/75"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setShowOfferModal(false)}
              className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--color-cream)] cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={offerSubmitting}
              className="px-5 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {offerSubmitting ? 'جاري الإرسال...' : 'إرسال عرض السعر'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Report Modal */}
      <Modal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
        title="إبلاغ عن مخالفة"
        subtitle="يتم مراجعة البلاغات من قِبل فريق الإشراف للحفاظ على جودة ومصداقية السوق."
        size="md"
      >
        {reportSent ? (
          <div className="p-4 rounded-lg bg-[var(--color-cream)] text-sm font-medium text-[var(--color-green-ink)]">
            تم استلام بلاغك بنجاح وسيتم مراجعته من قِبل المشرفين.
          </div>
        ) : (
          <form onSubmit={handleReportSubmit} className="space-y-4">
            {reportError && (
              <p
                role="alert"
                className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
              >
                {reportError}
              </p>
            )}
            <div>
              <label
                htmlFor="rep-reason"
                className="block text-xs font-medium text-[var(--color-muted)] mb-1"
              >
                سبب البلاغ
              </label>
              <select
                id="rep-reason"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)]"
              >
                <option value="بيانات غير مطابقة">بيانات أو صور غير مطابقة</option>
                <option value="سعر وهمي أو مضلل">سعر وهمي أو مضلل</option>
                <option value="إعلان مكرر">إعلان مكرر</option>
                <option value="مخالفة لشروط السوق">مخالفة لشروط السوق</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="rep-details"
                className="block text-xs font-medium text-[var(--color-muted)] mb-1"
              >
                تفاصيل إضافية
              </label>
              <textarea
                id="rep-details"
                rows={3}
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="اكتب ملاحظتك لمشرفي المنصة..."
                className="w-full p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/75"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-muted)] cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold cursor-pointer"
              >
                إرسال البلاغ
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Fullscreen Accessible Lightbox Modal for Photo Inspection */}
      <ImageLightbox
        open={lightboxOpen && activeMedia?.kind === 'image'}
        images={images}
        currentIndex={activeImageIndex}
        title={listing.title}
        onClose={() => setLightboxOpen(false)}
        onChangeIndex={(nextImgIdx) => {
          const targetUrl = images[nextImgIdx]?.url;
          const mappedIdx = galleryItems.findIndex(
            (g) => g.kind === 'image' && g.url === targetUrl
          );
          setActiveMediaIdx(mappedIdx >= 0 ? mappedIdx : nextImgIdx);
        }}
        returnFocusRef={zoomBtnRef}
      />

      <MarkSoldModal
        open={markSoldOpen}
        onClose={() => setMarkSoldOpen(false)}
        listing={listing}
        commissionSettings={commissionSettings}
        commissionEligibility={commissionEligibility}
        onSoldComplete={async () => {
          await onRefreshData?.();
        }}
        onTransferSubmitted={async () => {
          await onRefreshData?.();
        }}
        onNotify={onNotify}
      />

      {localToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] md:bottom-5 left-4 right-4 sm:right-auto sm:left-5 z-50 bg-[var(--color-green)] text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium border border-[var(--color-gold)]/50 text-center sm:text-right"
        >
          {localToast}
        </div>
      )}
      </div>
    </section>
  );
}
