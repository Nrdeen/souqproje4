import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Flag,
  Heart,
  Home,
  Info,
  Layers,
  LogIn,
  MapPin,
  Maximize2,
  MessageSquare,
  Navigation,
  Pencil,
  Phone,
  Play,
  Share2,
  ShieldCheck,
  Sparkles,
  Tag,
  ThumbsUp,
  User as UserIcon,
  UserPlus,
  Weight,
  XCircle,
  Zap,
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
import { buildSellerContactLinks, resolveListingStatusBadge } from '../lib/marketplace-helpers';
import { api } from '../lib/api';
import type { AuthMode } from '../lib/router';

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
  const [quickOfferInput, setQuickOfferInput] = useState('');
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
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [markingSold, setMarkingSold] = useState(false);
  const [markSoldOpen, setMarkSoldOpen] = useState(false);
  const [requestingFeature, setRequestingFeature] = useState(false);

  // Share Listing State
  const [copiedLink, setCopiedLink] = useState(false);
  const [manualShareUrlVisible, setManualShareUrlVisible] = useState(false);
  const [localToast, setLocalToast] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const copyPhoneTimerRef = useRef<number | null>(null);
  const localToastTimerRef = useRef<number | null>(null);

  const directMsgRef = useRef<HTMLTextAreaElement | null>(null);
  const galleryTouchRef = useRef<{ x: number; y: number } | null>(null);
  const activeListingIdRef = useRef(listing.id);
  activeListingIdRef.current = listing.id;
  const reportCloseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      if (copyPhoneTimerRef.current !== null) window.clearTimeout(copyPhoneTimerRef.current);
      if (localToastTimerRef.current !== null) window.clearTimeout(localToastTimerRef.current);
      if (reportCloseTimerRef.current !== null) window.clearTimeout(reportCloseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (reportCloseTimerRef.current !== null) {
      window.clearTimeout(reportCloseTimerRef.current);
      reportCloseTimerRef.current = null;
    }
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
    if (copyPhoneTimerRef.current !== null) {
      window.clearTimeout(copyPhoneTimerRef.current);
      copyPhoneTimerRef.current = null;
    }
    if (localToastTimerRef.current !== null) {
      window.clearTimeout(localToastTimerRef.current);
      localToastTimerRef.current = null;
    }
    setActiveMediaIdx(0);
    setLightboxOpen(false);
    setManualShareUrlVisible(false);
    setCopiedLink(false);
    setCopiedPhone(false);
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
    setQuickOfferInput('');
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
  }, [listing.id, listing.title, listing.expectedPrice, listing.priceAmount]);

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
  const isPublished = listing.status === 'Published';
  const statusBadge = resolveListingStatusBadge(listing, { lang: 'ar' });
  const isNewListing = statusBadge?.kind === 'new';

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
    } catch (err: unknown) {
      if (activeListingIdRef.current !== targetListingId) return;
      setMsgError(err instanceof Error ? err.message : 'تعذر إرسال رسالتك، حاول مرة أخرى');
    } finally {
      if (activeListingIdRef.current === targetListingId) {
        setSendingMsg(false);
      }
    }
  };

  const handleOpenOfferModal = (presetPrice?: number) => {
    if (!currentUser) {
      onRequireAuth?.('login');
      return;
    }
    setOfferError('');
    if (presetPrice && Number.isFinite(presetPrice) && presetPrice > 0) {
      setOfferedPrice(String(presetPrice));
    } else {
      setOfferedPrice(
        String(listing.expectedPrice || Math.round((listing.priceAmount * 0.92) / 10) * 10)
      );
    }
    setOfferQuantity('1');
    setOfferNote('');
    setShowOfferModal(true);
  };

  const handleQuickOfferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onRequireAuth?.('login');
      return;
    }
    const parsed = Number(quickOfferInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      showToastNotification('يرجى إدخال قيمة السوم بالريال السعودي');
      return;
    }
    handleOpenOfferModal(parsed);
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
      setQuickOfferInput('');
      setOfferSuccess(true);
    } catch (err: unknown) {
      if (activeListingIdRef.current !== targetListingId) return;
      setOfferError(err instanceof Error ? err.message : 'تعذر إرسال عرض السعر');
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
    } catch (err: unknown) {
      if (activeListingIdRef.current !== targetListingId) return;
      setReportError(err instanceof Error ? err.message : 'تعذر إرسال البلاغ، حاول مرة أخرى');
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
    } catch (err: unknown) {
      if (activeListingIdRef.current !== targetListingId) return;
      setContactError(
        err instanceof Error ? err.message : 'تعذر إظهار بيانات التواصل حالياً، حاول مرة أخرى'
      );
    } finally {
      if (activeListingIdRef.current === targetListingId) {
        setRevealingContact(false);
      }
    }
  };

  const handleCopyPhone = async () => {
    const rawPhone = contactLinks.phoneDisplay || revealedContact?.phone;
    if (!rawPhone) return;
    const copied = await copyTextWithFallback(rawPhone);
    if (copied) {
      setCopiedPhone(true);
      if (copyPhoneTimerRef.current !== null) window.clearTimeout(copyPhoneTimerRef.current);
      copyPhoneTimerRef.current = window.setTimeout(() => {
        setCopiedPhone(false);
        copyPhoneTimerRef.current = null;
      }, 2200);
      showToastNotification('تم نسخ رقم الجوال');
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
    } catch (err: unknown) {
      onNotify?.(err instanceof Error ? err.message : 'تعذر تسجيل طلب التمييز');
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

  const sellerInitials = (seller?.displayName || 'م')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();

  const locationSummary = [region?.name, listing.city].filter(Boolean).join('، ');
  const mapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [listing.city, region?.name, 'السعودية'].filter(Boolean).join(', ')
  )}`;

  const specCards: Array<{
    label: string;
    value: string;
    icon: typeof Tag;
    highlight?: boolean;
  }> = [
    {
      label: 'التصنيف / النوع',
      value: category?.name || 'أغنام',
      icon: Layers,
    },
    {
      label: 'السلالة',
      value: `${breed?.name || 'غير محدد'}${subCategory ? ` · ${subCategory.name}` : ''}`,
      icon: Sparkles,
    },
    {
      label: 'الجنس / الفئة',
      value: listing.sex || 'غير محدد',
      icon: Tag,
    },
    {
      label: 'العمر التقريبي',
      value: `${listing.ageMonths} أشهر`,
      icon: Clock,
    },
    {
      label: 'الوزن التقريبي',
      value: `${listing.weightKg} كجم`,
      icon: Weight,
    },
    {
      label: 'العدد المتاح',
      value: `${listing.quantity} رأس`,
      icon: CheckCircle2,
    },
    {
      label: 'التحصين البيطري',
      value: listing.vaccinated ? 'محصّن (دموي ومعوي)' : 'حسب المعاينة',
      icon: ShieldCheck,
      highlight: listing.vaccinated,
    },
    {
      label: 'آلية البيع والتفاوض',
      value: allowsOffers
        ? 'يقبل عروض السوم'
        : listing.isNegotiable
        ? 'قابل للتفاوض'
        : 'سعر نهائي',
      icon: BadgeDollarSign,
    },
    {
      label: 'المنطقة والمدينة',
      value: region?.name ? `${region.name} — ${listing.city}` : listing.city,
      icon: MapPin,
    },
  ];

  return (
    <section className="min-h-screen bg-[var(--color-canvas)] transition-colors overflow-x-clip">
      <div
        className={`mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 pt-5 sm:pt-6 ${
          !isOwner && isPublished ? 'pb-24 lg:pb-16' : 'pb-16'
        }`}
      >
        {/* Top Compact Breadcrumb + Back Navigation (Celebim Style) */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <nav className="flex min-w-0 items-center" aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5 text-xs sm:text-[13px] font-medium text-[var(--color-muted)]">
              {onGoHome && (
                <li className="inline-flex items-center">
                  <button
                    type="button"
                    onClick={onGoHome}
                    className="inline-flex items-center gap-1 text-[var(--color-muted)] hover:text-[var(--color-green-ink)] transition-colors cursor-pointer"
                  >
                    <Home size={13} aria-hidden="true" />
                    <span>الرئيسية</span>
                  </button>
                </li>
              )}
              <li className="inline-flex items-center gap-1.5">
                {onGoHome && <ChevronLeft size={14} className="opacity-55 shrink-0" aria-hidden="true" />}
                <button
                  type="button"
                  onClick={onBack}
                  className="text-[var(--color-muted)] hover:text-[var(--color-green-ink)] transition-colors cursor-pointer"
                >
                  الإعلانات
                </button>
              </li>
              {category && (
                <li className="inline-flex items-center gap-1.5">
                  <ChevronLeft size={14} className="opacity-55 shrink-0" aria-hidden="true" />
                  <span className="text-[var(--color-ink)]/85">{category.name}</span>
                </li>
              )}
              {breed && (
                <li className="hidden sm:inline-flex items-center gap-1.5">
                  <ChevronLeft size={14} className="opacity-55 shrink-0" aria-hidden="true" />
                  <span className="text-[var(--color-ink)]/85">{breed.name}</span>
                </li>
              )}
              <li aria-current="page" className="inline-flex items-center gap-1.5 min-w-0">
                <ChevronLeft size={14} className="opacity-55 shrink-0" aria-hidden="true" />
                <span className="truncate max-w-[200px] sm:max-w-[320px] font-bold text-[var(--color-green-ink)]">
                  {listing.title}
                </span>
              </li>
            </ol>
          </nav>

          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-bold text-[var(--color-ink)] hover:border-[var(--color-gold)] hover:text-[var(--color-green-ink)] transition-colors cursor-pointer shrink-0"
          >
            <ArrowRight size={14} aria-hidden="true" />
            <span>العودة إلى الإعلانات</span>
          </button>
        </div>

        {/* Non-published Status Notice */}
        {!isPublished && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[var(--color-gold)]/55 bg-[var(--color-gold-soft)]/70 dark:bg-[var(--color-surface-warm)] p-4 text-[var(--color-ink)]">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-gold)]" aria-hidden="true" />
            <div>
              <h2 className="font-display text-sm font-extrabold">
                حالة هذا الإعلان: {formatStatusLabel(listing.status)}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">
                {listing.status === 'Sold'
                  ? 'تم إتمام بيع هذا العرض، لذلك تم إيقاف أزرار التواصل المباشر وتقديم العروض.'
                  : 'أزرار التواصل المباشر متاحة فقط للإعلانات المنشورة والنشطة في السوق.'}
              </p>
            </div>
          </div>
        )}

        {/* Main 2-Column Layout (1fr Main + 340px Sticky Sidebar — Celebim 1:1) */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 lg:gap-7 items-start">
          {/* MAIN COLUMN (Right in RTL) */}
          <div className="flex flex-col min-w-0">
            {/* 1. Title & Meta Card */}
            <div className="bg-[var(--color-surface)] border-[1.5px] border-[var(--color-border)] rounded-2xl p-5 sm:p-6 mb-5 shadow-xs">
              <div className="flex gap-1.5 flex-wrap mb-3">
                {category && (
                  <span className="rounded-md border border-[var(--color-gold)]/45 bg-[var(--color-gold-soft)]/65 dark:bg-[var(--color-surface-warm)] px-2.5 py-1 text-[11px] font-bold tracking-wide text-[var(--color-green-ink)]">
                    {category.name}
                  </span>
                )}
                {breed && (
                  <span className="rounded-md border border-[var(--color-border)] bg-[var(--color-cream)]/60 px-2.5 py-1 text-[11px] font-bold tracking-wide text-[var(--color-ink)]">
                    {breed.name}
                  </span>
                )}
                {subCategory && (
                  <span className="rounded-md border border-[var(--color-border)] bg-[var(--color-cream)]/40 px-2.5 py-1 text-[11px] font-bold tracking-wide text-[var(--color-muted)]">
                    {subCategory.name}
                  </span>
                )}
                {listing.isFeatured && isPublished && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-[var(--color-gold)] bg-[var(--color-gold)] px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-[#10241B]">
                    <Zap size={12} className="fill-current" aria-hidden="true" />
                    <span>مميز</span>
                  </span>
                )}
                {isNewListing && !listing.isFeatured && isPublished && (
                  <span className="rounded-md border border-[var(--color-green)] bg-[var(--color-green)] px-2.5 py-1 text-[11px] font-bold tracking-wide text-white">
                    إعلان جديد
                  </span>
                )}
                {!isPublished && (
                  <span className="rounded-md border border-[var(--color-border)] bg-[var(--color-ink)] px-2.5 py-1 text-[11px] font-bold text-[var(--color-surface)]">
                    {formatStatusLabel(listing.status)}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 flex-wrap mb-3">
                <h1 className="font-display text-xl sm:text-2xl font-black text-[var(--color-ink)] leading-tight text-balance">
                  {listing.title}
                </h1>
                {listing.vaccinated && (
                  <span className="bg-[#DCFCE7] text-[#15803D] dark:bg-emerald-950/70 dark:text-emerald-300 border border-[#BBF7D0] dark:border-emerald-800/70 inline-flex items-center gap-1.5 text-[12px] font-bold px-3 py-1 rounded-lg shrink-0">
                    <ShieldCheck size={15} aria-hidden="true" />
                    <span>محصّن بيطرياً</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-x-4 gap-y-2 flex-wrap text-xs text-[var(--color-muted)]">
                <div className="flex items-center gap-1.5">
                  <MapPin size={13} className="text-[var(--color-green-ink)] shrink-0" aria-hidden="true" />
                  <span>
                    <strong className="text-[var(--color-ink)]">{region?.name || 'المملكة'}</strong>
                    {listing.city ? `، ${listing.city}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock size={13} className="shrink-0" aria-hidden="true" />
                  <span>{formatRelativeArabicTime(listing.publishedAt)}</span>
                </div>
                {likesEnabled && (
                  <div className="flex items-center gap-1.5 tabular-nums">
                    <Heart size={13} className="shrink-0" aria-hidden="true" />
                    <span>
                      <strong className="text-[var(--color-ink)]">{likesCount}</strong> إعجاب
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 tabular-nums">
                  <Calendar size={13} className="shrink-0" aria-hidden="true" />
                  <span>
                    رقم الإعلان:{' '}
                    <strong className="text-[var(--color-ink)]" dir="ltr">
                      {listing.id.slice(0, 10)}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Highlighted Price & Live Weight Banner Card */}
            <div className="mb-5 rounded-2xl border-[1.5px] border-[var(--color-gold)]/55 bg-[var(--color-gold-soft)]/50 dark:bg-[var(--color-surface-warm)] p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center sm:gap-5">
                <div className="flex-1 min-w-0">
                  <div className="mb-1.5 text-[11px] font-bold tracking-[0.04em] text-[var(--color-muted)]">
                    السعر المطلوب للرأس
                  </div>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-display text-[32px] sm:text-[40px] font-black leading-none tracking-tight text-[var(--color-green-ink)] tabular-nums">
                      {formatPriceSar(listing.priceAmount)}
                    </span>
                    <span className="text-sm sm:text-base font-bold text-[var(--color-muted)]">
                      / للرأس
                    </span>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    {totalHerdValue !== null && (
                      <span className="font-bold text-[var(--color-green-ink)] tabular-nums">
                        إجمالي قيمة القطيع ({listing.quantity} رأس): {formatPriceSar(totalHerdValue)}
                      </span>
                    )}
                    {listing.expectedPrice && listing.expectedPrice > 0 && (
                      <span className="font-semibold text-[var(--color-ink)] tabular-nums">
                        سعر التفاوض المتوقع: {formatPriceSar(listing.expectedPrice)}
                      </span>
                    )}
                    <span className="font-medium text-[var(--color-muted)]">
                      {allowsOffers
                        ? 'ميزة السوم مفعّلة'
                        : listing.isNegotiable
                        ? 'قابل للتفاوض المباشر'
                        : 'سعر نهائي'}
                    </span>
                  </div>
                </div>

                <div className="min-w-[165px] rounded-xl border border-[var(--color-gold)]/45 bg-[var(--color-surface)] p-3.5 text-center shadow-xs shrink-0">
                  <div className="mb-1 text-[10px] font-semibold tracking-[0.04em] text-[var(--color-muted)]">
                    الوزن التقديري للرأس
                  </div>
                  <div className="font-display text-[22px] font-black leading-none text-[var(--color-green-ink)] tabular-nums">
                    {listing.weightKg > 0 ? `${listing.weightKg} كجم` : 'حسب المعاينة'}
                  </div>
                  <div className="mt-1.5 text-[11px] font-bold text-[var(--color-muted)] tabular-nums">
                    الكمية المتاحة: {listing.quantity} رأس
                  </div>
                </div>
              </div>

              {priceReading && (
                <div className="mt-4 pt-3.5 border-t border-[var(--color-gold)]/30">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs leading-relaxed text-[var(--color-ink)]">
                      {priceReading.sentence}
                    </p>
                    {onOpenPriceIndex && (
                      <button
                        type="button"
                        onClick={onOpenPriceIndex}
                        className="text-xs font-bold text-[var(--color-green-ink)] hover:underline cursor-pointer shrink-0"
                      >
                        دليل الأسعار الاسترشادية
                      </button>
                    )}
                  </div>
                  <div
                    className="relative mt-2.5 h-1.5 rounded-full bg-[var(--color-border)]"
                    role="img"
                    aria-label={priceReading.sentence}
                  >
                    <span
                      className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-[var(--color-green-ink)] border-2 border-[var(--color-surface)] shadow-xs"
                      style={{
                        insetInlineStart: `clamp(0px, calc(${priceReading.marker}% - 7px), calc(100% - 14px))`,
                      }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] tabular-nums text-[var(--color-muted)]">
                    <span>{formatPriceSar(priceReading.min)}</span>
                    <span>المتوسط {formatPriceSar(priceReading.avg)}</span>
                    <span>{formatPriceSar(priceReading.max)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Media Gallery Card (16:10 Blurred-Backdrop Viewer + Floating Icons + Thumbnail Strip + Notice) */}
            <div className="w-full bg-[var(--color-surface)] border-[1.5px] border-[var(--color-border)] rounded-2xl overflow-hidden mb-5 shadow-xs">
              <div
                className="relative aspect-[16/10] w-full bg-[var(--color-cream)]/60 overflow-hidden group touch-pan-y select-none"
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
                    className="relative w-full h-full block cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-gold)]"
                  >
                    {activeMedia?.url && (
                      <img
                        src={activeMedia.url}
                        alt=""
                        aria-hidden="true"
                        className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-30 pointer-events-none"
                      />
                    )}
                    <SafeImage
                      src={activeMedia?.url}
                      alt={`${listing.title} - صورة ${safeMediaIdx + 1}`}
                      width={960}
                      height={600}
                      loading="eager"
                      className="relative z-10 w-full h-full object-contain p-1.5 sm:p-2 transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  </button>
                )}

                {/* Floating Action Stack Top-Left (End in RTL) */}
                <div className="absolute top-3.5 left-3.5 z-20 flex flex-col gap-2 items-center">
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(listing.id)}
                    aria-pressed={isFavorite}
                    aria-label={isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                    className={`w-10 h-10 rounded-full shadow-sm border flex items-center justify-center transition-all hover:scale-105 cursor-pointer ${
                      isFavorite
                        ? 'bg-red-50 border-red-200 text-red-500'
                        : 'bg-white/92 dark:bg-[var(--color-surface)]/92 border-[var(--color-border)] text-[var(--color-ink)] hover:text-red-500'
                    }`}
                  >
                    <Heart size={17} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyShareLink}
                    aria-label="نسخ رابط الإعلان"
                    className="w-10 h-10 rounded-full bg-white/92 dark:bg-[var(--color-surface)]/92 border border-[var(--color-border)] text-[var(--color-ink)] hover:border-[var(--color-gold)] hover:text-[var(--color-green-ink)] shadow-sm flex items-center justify-center transition-all hover:scale-105 cursor-pointer"
                  >
                    {copiedLink ? (
                      <Check size={16} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                    ) : (
                      <Share2 size={16} aria-hidden="true" />
                    )}
                  </button>

                  {activeMedia?.kind === 'image' && (
                    <button
                      ref={zoomBtnRef}
                      type="button"
                      onClick={() => setLightboxOpen(true)}
                      aria-label="عرض الصورة بالحجم الكامل"
                      className="w-10 h-10 rounded-full bg-white/92 dark:bg-[var(--color-surface)]/92 border border-[var(--color-border)] text-[var(--color-ink)] hover:border-[var(--color-gold)] hover:text-[var(--color-green-ink)] shadow-sm flex items-center justify-center transition-all hover:scale-105 cursor-pointer"
                    >
                      <Maximize2 size={15} aria-hidden="true" />
                    </button>
                  )}
                </div>

                {/* Counter & Media Type Top-Right (Start in RTL) */}
                <div className="absolute top-3.5 right-3.5 z-20 flex items-center gap-2 pointer-events-none">
                  {galleryItems.length > 1 && (
                    <span className="px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-xs text-white text-xs font-bold tabular-nums">
                      {safeMediaIdx + 1} / {galleryItems.length}
                    </span>
                  )}
                  {activeMedia?.kind === 'video' && (
                    <span className="px-2.5 py-1 rounded-full bg-[var(--color-green)]/90 text-white text-xs font-bold inline-flex items-center gap-1">
                      <Play
                        size={11}
                        className="fill-[var(--color-gold)] text-[var(--color-gold)]"
                        aria-hidden="true"
                      />
                      <span>فيديو المعاينة</span>
                    </span>
                  )}
                </div>

                {/* Prev / Next Navigation */}
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <ChevronRight size={20} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="الوسيط التالي"
                      onClick={() =>
                        setActiveMediaIdx((prev) => (prev + 1) % galleryItems.length)
                      }
                      className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <ChevronLeft size={20} aria-hidden="true" />
                    </button>

                    {/* Mobile Pagination Dots */}
                    <div
                      aria-hidden="true"
                      className="sm:hidden absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/45 backdrop-blur-xs pointer-events-none"
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

              {/* Thumbnail Strip */}
              {galleryItems.length > 1 && (
                <div className="flex gap-2 p-3 bg-[var(--color-cream)]/60 border-t border-[var(--color-border)] overflow-x-auto">
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
                      className={`w-[72px] h-[54px] rounded-lg overflow-hidden border-2 shrink-0 cursor-pointer relative transition-all ${
                        idx === safeMediaIdx
                          ? 'border-[var(--color-gold)] ring-2 ring-[var(--color-gold)]/35 opacity-100'
                          : 'border-[var(--color-border)] opacity-75 hover:opacity-100'
                      }`}
                    >
                      {item.kind === 'video' ? (
                        <div className="w-full h-full bg-[var(--color-green)] text-white flex flex-col items-center justify-center gap-0.5">
                          <Play
                            size={16}
                            className="fill-[var(--color-gold)] text-[var(--color-gold)]"
                            aria-hidden="true"
                          />
                          <span className="text-[10px] font-bold">فيديو</span>
                        </div>
                      ) : (
                        <SafeImage
                          src={item.url}
                          alt={`${listing.title} - مصغرة ${idx + 1}`}
                          width={160}
                          height={120}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Bottom Media Notice Strip */}
              <div className="p-3 bg-[var(--color-gold-soft)]/55 dark:bg-[var(--color-cream)] border-t border-[var(--color-gold)]/35 flex items-center gap-2 text-[11px] font-medium text-[var(--color-muted)]">
                <Info size={14} className="text-[var(--color-gold)] shrink-0" aria-hidden="true" />
                <span>
                  يمكنك استخدام أزرار التواصل الجانبية لطلب صور أو مقاطع فيديو إضافية من المربي قبل الشراء.
                </span>
              </div>
            </div>

            {/* 4. Structured Specifications Card (3-column Icon Cards with Vertical Accent Bar) */}
            <section className="mb-5 rounded-2xl border-[1.5px] border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs sm:p-6">
              <div className="mb-5 flex items-stretch gap-3 border-b border-[var(--color-border)] pb-4">
                <span className="w-1 shrink-0 rounded-full bg-[var(--color-gold)]" aria-hidden="true" />
                <div>
                  <h2 className="font-display text-base font-extrabold text-[var(--color-ink)]">
                    المواصفات التفصيلية للعرض
                  </h2>
                  <p className="mt-0.5 text-[11px] leading-4 text-[var(--color-muted)]">
                    البيانات الأساسية الموثقة من المربي لهذا الإعلان
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {specCards.map((spec) => {
                  const Icon = spec.icon;
                  return (
                    <div
                      key={spec.label}
                      className="group relative flex min-h-[90px] items-center gap-3.5 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] dark:bg-[var(--color-cream)]/40 p-4 transition-all duration-200 hover:-translate-y-px hover:border-[var(--color-gold)] hover:bg-[var(--color-surface)] hover:shadow-md"
                    >
                      <span
                        className="absolute inset-y-3 right-0 w-[3px] origin-center scale-y-0 rounded-l-full bg-[var(--color-gold)] transition-transform duration-200 group-hover:scale-y-100"
                        aria-hidden="true"
                      />
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--color-gold)]/45 bg-[var(--color-gold-soft)]/70 dark:bg-[var(--color-surface)] text-[var(--color-green-ink)] transition-colors duration-200 group-hover:border-[var(--color-green)] group-hover:bg-[var(--color-green)] group-hover:text-white">
                        <Icon className="h-[17px] w-[17px]" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <dt className="text-[11px] font-semibold text-[var(--color-muted)]">
                          {spec.label}
                        </dt>
                        <dd
                          className={`mt-1 break-words text-sm font-bold leading-5 ${
                            spec.highlight
                              ? 'text-[var(--color-green-ink)]'
                              : 'text-[var(--color-ink)]'
                          }`}
                        >
                          {spec.value}
                        </dd>
                      </div>
                    </div>
                  );
                })}
              </dl>
            </section>

            {/* 5. Listing Description Card */}
            <div className="mb-5 rounded-2xl border-[1.5px] border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs sm:p-6">
              <div className="mb-5 flex items-stretch gap-3 border-b border-[var(--color-border)] pb-4">
                <span className="w-1 shrink-0 rounded-full bg-[var(--color-gold)]" aria-hidden="true" />
                <div>
                  <h2 className="font-display text-base font-extrabold text-[var(--color-ink)]">
                    وصف الإعلان وتفاصيل المربي
                  </h2>
                  <p className="mt-0.5 text-[11px] leading-4 text-[var(--color-muted)]">
                    المعلومات والملاحظات المرفقة من صاحب الإعلان
                  </p>
                </div>
              </div>
              <div className="text-sm text-[var(--color-ink)]/90 leading-relaxed whitespace-pre-line break-words">
                {listing.description}
              </div>
            </div>

            {/* 6. Location Card (Visual Region Preview + 3 Info Boxes, CSP-Safe) */}
            <div className="mb-5 rounded-2xl border-[1.5px] border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs sm:p-6">
              <div className="mb-5 flex items-stretch gap-3 border-b border-[var(--color-border)] pb-4">
                <span className="w-1 shrink-0 rounded-full bg-[var(--color-gold)]" aria-hidden="true" />
                <div>
                  <h2 className="font-display text-base font-extrabold text-[var(--color-ink)]">
                    الموقع الجغرافي
                  </h2>
                  <p className="mt-0.5 text-[11px] leading-4 text-[var(--color-muted)]">
                    نطاق تواجد الحلال والمعاينة الميدانية
                  </p>
                </div>
              </div>

              {/* Clean SVG Topographic Map Preview */}
              <div className="relative h-[165px] sm:h-[195px] rounded-xl overflow-hidden mb-4 border-[1.5px] border-[var(--color-border)] bg-[var(--color-cream)]/55 flex flex-col items-center justify-center text-center px-4">
                <svg
                  className="absolute inset-0 w-full h-full opacity-25 text-[var(--color-green-ink)] pointer-events-none"
                  aria-hidden="true"
                >
                  <defs>
                    <pattern id="souq-map-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                      <path
                        d="M 32 0 L 0 0 0 32"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="0.6"
                      />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#souq-map-grid)" />
                </svg>

                <div className="relative z-10 flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-[var(--color-green)] text-white shadow-md border-2 border-[var(--color-gold)] flex items-center justify-center">
                    <MapPin size={22} aria-hidden="true" />
                  </div>
                  <p className="font-display text-sm sm:text-base font-extrabold text-[var(--color-ink)]">
                    {locationSummary || 'المملكة العربية السعودية'}
                  </p>
                  <a
                    href={mapsSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-gold)]/55 bg-[var(--color-surface)] px-3.5 py-1.5 text-xs font-bold text-[var(--color-green-ink)] hover:border-[var(--color-green)] hover:bg-[var(--color-green)] hover:text-white transition-colors shadow-xs"
                  >
                    <Navigation size={13} aria-hidden="true" />
                    <span>عرض النطاق التقريبي على الخريطة</span>
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div className="group flex min-w-0 items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] dark:bg-[var(--color-cream)]/40 p-3 transition-all duration-200 hover:-translate-y-px hover:border-[var(--color-gold)] hover:bg-[var(--color-surface)]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-gold)]/45 bg-[var(--color-gold-soft)]/60 text-[var(--color-green-ink)] transition-colors group-hover:bg-[var(--color-green)] group-hover:text-white">
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold text-[var(--color-muted)]">
                      المنطقة
                    </span>
                    <strong className="mt-0.5 block truncate text-[13px] font-bold text-[var(--color-ink)]">
                      {region?.name || 'غير محدد'}
                    </strong>
                  </span>
                </div>

                <div className="group flex min-w-0 items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] dark:bg-[var(--color-cream)]/40 p-3 transition-all duration-200 hover:-translate-y-px hover:border-[var(--color-gold)] hover:bg-[var(--color-surface)]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-gold)]/45 bg-[var(--color-gold-soft)]/60 text-[var(--color-green-ink)] transition-colors group-hover:bg-[var(--color-green)] group-hover:text-white">
                    <Navigation className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold text-[var(--color-muted)]">
                      المدينة / المحافظة
                    </span>
                    <strong className="mt-0.5 block truncate text-[13px] font-bold text-[var(--color-ink)]">
                      {listing.city || 'غير محدد'}
                    </strong>
                  </span>
                </div>

                <div className="group flex min-w-0 items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] dark:bg-[var(--color-cream)]/40 p-3 transition-all duration-200 hover:-translate-y-px hover:border-[var(--color-gold)] hover:bg-[var(--color-surface)]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-gold)]/45 bg-[var(--color-gold-soft)]/60 text-[var(--color-green-ink)] transition-colors group-hover:bg-[var(--color-green)] group-hover:text-white">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold text-[var(--color-muted)]">
                      المعاينة والاستلام
                    </span>
                    <strong className="mt-0.5 block truncate text-[13px] font-bold text-[var(--color-ink)]">
                      معاينة مباشرة بالموقع
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {/* 7. Share & Report Card */}
            <div className="bg-[var(--color-surface)] border-[1.5px] border-[var(--color-border)] rounded-2xl p-5 sm:p-6 mb-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Share2 size={15} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                  <h2 className="font-display text-sm font-extrabold text-[var(--color-ink)]">
                    شارك هذا الإعلان
                  </h2>
                </div>
                <span className="text-[11px] text-[var(--color-muted)]">
                  انسخ الرابط أو أرسله مباشرة عبر التطبيقات
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {supportsNativeShare && (
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    className="h-10 px-3.5 rounded-[9px] bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                  className="h-10 px-3.5 rounded-[9px] border border-[var(--color-border)] bg-[var(--color-surface-warm)] hover:border-[#1B7A3A] hover:text-[#1B7A3A] text-xs font-bold text-[var(--color-ink)] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
                    <path d="M12.04 2a9.93 9.93 0 0 0-8.5 15.05L2 22l5.1-1.34A9.93 9.93 0 1 0 12.04 2Zm5.78 14.08c-.24.68-1.4 1.3-1.94 1.38-.5.07-1.13.1-1.82-.12-.42-.14-.96-.32-1.65-.62-2.9-1.25-4.79-4.18-4.93-4.37-.14-.2-1.18-1.57-1.18-3 0-1.42.74-2.12 1-2.41.27-.29.58-.36.77-.36h.56c.18 0 .42-.07.66.5.24.58.82 2 .9 2.14.07.14.12.31.02.5-.1.2-.15.32-.29.49-.15.17-.3.38-.44.51-.14.15-.3.3-.13.59.17.29.75 1.24 1.61 2.01 1.11.99 2.04 1.3 2.33 1.44.29.15.46.12.63-.07.17-.2.72-.84.91-1.13.2-.29.39-.24.65-.15.27.1 1.68.8 1.97.94.29.15.48.22.55.34.07.12.07.7-.17 1.38Z" />
                  </svg>
                  <span>واتساب</span>
                </a>

                <button
                  type="button"
                  onClick={handleCopyShareLink}
                  className={`h-10 px-3.5 rounded-[9px] border text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    copiedLink
                      ? 'bg-[var(--color-gold-soft)]/70 border-[var(--color-gold)] text-[var(--color-green-ink)]'
                      : 'bg-[var(--color-surface-warm)] border-[var(--color-border)] text-[var(--color-ink)] hover:border-[var(--color-gold)]'
                  }`}
                >
                  {copiedLink ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                  <span>{copiedLink ? 'تم نسخ الرابط' : 'نسخ الرابط'}</span>
                </button>

                <a
                  href={sharePayload.twitterHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="مشاركة الإعلان عبر منصة X"
                  className="h-10 px-3.5 rounded-[9px] border border-[var(--color-border)] bg-[var(--color-surface-warm)] hover:border-[var(--color-gold)] text-xs font-bold text-[var(--color-ink)] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  <span>إكس (X)</span>
                </a>
              </div>

              {manualShareUrlVisible && (
                <div className="mt-3 flex items-center gap-2">
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

              {!isOwner && (
                <div className="mt-5 border-t border-[var(--color-border)] pt-4 flex items-center justify-between gap-2">
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
                    className="inline-flex items-center gap-2 text-xs font-bold text-[var(--color-muted)] transition hover:text-red-700 dark:hover:text-red-400 cursor-pointer"
                  >
                    <Flag size={14} aria-hidden="true" />
                    <span>إبلاغ عن مخالفة في هذا الإعلان</span>
                  </button>
                  <span className="text-[11px] text-[var(--color-muted)] hidden sm:inline">
                    يخضع للمراجعة الإدارية الفورية
                  </span>
                </div>
              )}
            </div>

            {/* 8. Price Offers / Negotiation Log */}
            {allowsOffers && (
              <div className="mb-5 rounded-2xl border-[1.5px] border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--color-border)]">
                  <div className="flex items-stretch gap-3">
                    <span className="w-1 shrink-0 rounded-full bg-[var(--color-gold)]" aria-hidden="true" />
                    <div>
                      <h2 className="font-display text-base font-extrabold text-[var(--color-ink)]">
                        سجل عروض الأسعار والتفاوض ({listingOffers.length})
                      </h2>
                      <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                        عروض السوم المقدمة من المشترين على هذا الإعلان مع حالة رد المربي
                      </p>
                    </div>
                  </div>

                  {!isOwner && (
                    <button
                      type="button"
                      onClick={() => handleOpenOfferModal()}
                      className="min-h-[38px] px-4 py-2 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <BadgeDollarSign size={15} aria-hidden="true" />
                      <span>تقديم عرض سعر</span>
                    </button>
                  )}
                </div>

                {listingOffers.length === 0 ? (
                  <p className="mt-4 text-xs sm:text-sm text-[var(--color-muted)]">
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
                            <span className="font-bold text-[var(--color-ink)]">
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
                            className={`text-xs font-bold ${
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
                                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <CheckCircle2 size={13} aria-hidden="true" />
                                <span>قبول</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onRespondToOffer(offer.id, 'rejected')}
                                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
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

          {/* STICKY SIDEBAR (Left in RTL — exact Celebim aside stack) */}
          <aside className="flex flex-col gap-4 lg:sticky lg:top-20 min-w-0">
            {/* Owner Management Card */}
            {isOwner && (
              <div className="rounded-2xl border-[1.5px] border-[var(--color-gold)]/55 bg-[var(--color-surface)] p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] pb-3">
                  <p className="font-display text-sm font-extrabold text-[var(--color-ink)]">
                    إدارة إعلانك
                  </p>
                  <span className="rounded-md bg-[var(--color-gold-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-green-ink)]">
                    {formatStatusLabel(listing.status)}
                  </span>
                </div>

                {listing.rejectionReason && (
                  <p className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg p-2.5">
                    سبب الرفض: {listing.rejectionReason}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {onEditListing && (
                    <button
                      type="button"
                      onClick={() => onEditListing(listing)}
                      className="flex-1 min-w-[120px] min-h-[42px] px-3.5 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Pencil size={14} aria-hidden="true" />
                      <span>تعديل الإعلان</span>
                    </button>
                  )}
                  {onMarkSold && isPublished && (
                    <button
                      type="button"
                      disabled={markingSold}
                      onClick={handleConfirmMarkSold}
                      className="flex-1 min-w-[120px] min-h-[42px] px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] hover:border-[var(--color-gold)] text-[var(--color-ink)] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      <CheckCircle2 size={14} aria-hidden="true" />
                      <span>{markingSold ? 'جاري التحديث...' : 'تحديد كمباع'}</span>
                    </button>
                  )}
                </div>

                {!listing.isFeatured &&
                  (listing.status === 'Published' || listing.status === 'Pending') && (
                    <div className="pt-2.5 border-t border-[var(--color-border)] space-y-2 text-xs">
                      {listing.featuredRequested ? (
                        <span className="text-[var(--color-green-ink)] font-bold inline-flex items-center gap-1.5">
                          <Sparkles size={14} className="text-[var(--color-gold)] shrink-0" aria-hidden="true" />
                          <span>طلب تمييز الإعلان مسجل — أكمل الحوالة من لوحة حسابي</span>
                        </span>
                      ) : (
                        <>
                          <p className="text-[var(--color-muted)]">
                            تمييز وتثبيت الإعلان ({formatPriceSar(commissionSettings?.featuredWeeklyPriceSar ?? 35)} / أسبوع):
                          </p>
                          <button
                            type="button"
                            disabled={requestingFeature}
                            onClick={handleRequestFeatured}
                            className="w-full min-h-[38px] px-3 rounded-xl border border-[var(--color-gold)] bg-[var(--color-gold-soft)]/50 hover:bg-[var(--color-gold-soft)] text-xs font-bold text-[var(--color-green-ink)] inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
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

            {/* Seller Info & Direct Contact Card (Celebim q Card) */}
            {seller && (
              <div className="rounded-2xl border-[1.5px] border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs sm:p-[22px]">
                <div className="mb-4 text-[12px] font-bold tracking-[0.04em] text-[var(--color-muted)]">
                  معلومات البائع والمربّي
                </div>

                <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] pb-4 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenSellerProfile(seller.userId)}
                      aria-label={`عرض ملف المربي ${seller.displayName}`}
                      className="w-14 h-14 rounded-full bg-[var(--color-gold-soft)] border-[2.5px] border-[var(--color-gold)]/60 flex items-center justify-center text-xl font-black text-[var(--color-green-ink)] shrink-0 hover:scale-105 transition-transform duration-200 cursor-pointer"
                    >
                      {sellerInitials || <UserIcon size={22} aria-hidden="true" />}
                    </button>

                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpenSellerProfile(seller.userId)}
                        className="block text-right text-base font-extrabold text-[var(--color-ink)] leading-tight mb-0.5 hover:text-[var(--color-green-ink)] transition-colors truncate max-w-full cursor-pointer"
                      >
                        {seller.displayName}
                      </button>
                      <div className="text-xs text-[var(--color-muted)] mb-1.5 truncate">
                        {seller.city} · خبرة {seller.yearsExperience} سنة
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {isSellerVerified(seller) ? (
                          <VerifiedSellerBadge variant="badge" />
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-[var(--color-cream)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-muted)]">
                            مربٍّ مسجّل
                          </span>
                        )}
                        <span className="inline-flex items-center rounded-md bg-[var(--color-gold-soft)]/70 px-2 py-0.5 text-[10px] font-bold text-[var(--color-green-ink)] tabular-nums">
                          {seller.totalSales} بيعة
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenSellerProfile(seller.userId)}
                    aria-label="الانتقال إلى صفحة المربي"
                    className="group flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-cream)]/80 hover:bg-[var(--color-gold-soft)] transition-colors cursor-pointer"
                  >
                    <ArrowLeft
                      size={15}
                      className="text-[var(--color-muted)] group-hover:text-[var(--color-green-ink)] transition-colors"
                      aria-hidden="true"
                    />
                  </button>
                </div>

                {seller.bio && (
                  <p className="mb-4 text-xs text-[var(--color-muted)] leading-relaxed line-clamp-3">
                    {seller.bio}
                  </p>
                )}

                {/* Contact Actions Inside Seller Card */}
                {!currentUser && (
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] dark:bg-[var(--color-cream)]/40 p-3.5 space-y-2.5">
                    <p className="text-xs font-bold text-[var(--color-ink)]">
                      سجّل الدخول لإظهار رقم البائع والواتساب
                    </p>
                    <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
                      لحماية خصوصية المربّين، تظهر أرقام التواصل المباشر للأعضاء المسجلين فقط.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => onRequireAuth?.('login')}
                        className="flex-1 min-h-[40px] px-3 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <LogIn size={14} aria-hidden="true" />
                        <span>تسجيل الدخول للتواصل</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRequireAuth?.('register')}
                        className="min-h-[40px] px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-gold)] text-[var(--color-green-ink)] text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <UserPlus size={14} aria-hidden="true" />
                        <span>جديد</span>
                      </button>
                    </div>
                  </div>
                )}

                {currentUser && !isOwner && (
                  <div className="flex flex-col gap-2.5">
                    {!isPublished ? (
                      <div className="bg-[var(--color-cream)]/60 border border-[var(--color-border)] rounded-xl p-3 text-center">
                        <p className="text-xs font-semibold text-[var(--color-muted)]">
                          بيانات الاتصال المباشر متاحة فقط للإعلانات المنشورة.
                        </p>
                      </div>
                    ) : seller.contactAvailable === false ? (
                      <div className="bg-[var(--color-cream)]/60 border border-[var(--color-border)] rounded-xl p-3 text-center">
                        <p className="text-xs font-semibold text-[var(--color-muted)]">
                          فضّل البائع التواصل عبر رسائل المنصة الداخلية أدناه.
                        </p>
                      </div>
                    ) : !revealedContact ? (
                      <>
                        <button
                          type="button"
                          disabled={revealingContact}
                          onClick={handleRevealContact}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1B7A3A] px-4 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#155f2c] cursor-pointer disabled:opacity-60"
                        >
                          <Phone size={16} aria-hidden="true" />
                          <span>
                            {revealingContact ? 'جاري التحقق وإظهار الرقم...' : 'إظهار رقم البائع والواتساب'}
                          </span>
                        </button>
                        {contactError && (
                          <p
                            role="alert"
                            className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
                          >
                            {contactError}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        {contactLinks.whatsappHref && (
                          <a
                            href={contactLinks.whatsappHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`مراسلة البائع ${seller.displayName} عبر واتساب`}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1B7A3A] px-4 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#155f2c]"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="w-4 h-4 fill-current shrink-0"
                              aria-hidden="true"
                            >
                              <path d="M12.04 2a9.93 9.93 0 0 0-8.5 15.05L2 22l5.1-1.34A9.93 9.93 0 1 0 12.04 2Zm5.78 14.08c-.24.68-1.4 1.3-1.94 1.38-.5.07-1.13.1-1.82-.12-.42-.14-.96-.32-1.65-.62-2.9-1.25-4.79-4.18-4.93-4.37-.14-.2-1.18-1.57-1.18-3 0-1.42.74-2.12 1-2.41.27-.29.58-.36.77-.36h.56c.18 0 .42-.07.66.5.24.58.82 2 .9 2.14.07.14.12.31.02.5-.1.2-.15.32-.29.49-.15.17-.3.38-.44.51-.14.15-.3.3-.13.59.17.29.75 1.24 1.61 2.01 1.11.99 2.04 1.3 2.33 1.44.29.15.46.12.63-.07.17-.2.72-.84.91-1.13.2-.29.39-.24.65-.15.27.1 1.68.8 1.97.94.29.15.48.22.55.34.07.12.07.7-.17 1.38Z" />
                            </svg>
                            <span>تواصل عبر واتساب</span>
                          </a>
                        )}

                        {contactLinks.phoneDisplay && (
                          <>
                            <button
                              type="button"
                              onClick={() => setShowPhone((p) => !p)}
                              aria-expanded={showPhone}
                              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-bold text-[var(--color-ink)] transition-colors hover:border-[var(--color-gold)] hover:text-[var(--color-green-ink)] cursor-pointer"
                            >
                              <Phone size={15} aria-hidden="true" />
                              <span>{showPhone ? 'إخفاء رقم الجوال' : 'عرض رقم الجوال'}</span>
                            </button>

                            {showPhone && (
                              <div className="bg-[var(--color-gold-soft)]/55 dark:bg-[var(--color-surface-warm)] border-[1.5px] border-dashed border-[var(--color-gold)]/70 rounded-xl p-3 text-center">
                                <a
                                  href={contactLinks.telHref || '#'}
                                  dir="ltr"
                                  className="block text-lg font-black text-[var(--color-ink)] tracking-wider tabular-nums hover:text-[var(--color-green-ink)]"
                                >
                                  {contactLinks.phoneDisplay}
                                </a>
                                <button
                                  type="button"
                                  onClick={handleCopyPhone}
                                  className="text-[11px] text-[var(--color-green-ink)] font-bold mt-1 hover:underline cursor-pointer"
                                >
                                  {copiedPhone ? 'تم النسخ ✓' : 'نسخ الرقم'}
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}

                <p className="mt-4 text-center text-[10.5px] leading-relaxed text-[var(--color-muted)]">
                  لا تقم بالتحويل المالي قبل المعاينة المباشرة للحلال والتحقق من المواصفات والبيانات.
                </p>
              </div>
            )}

            {/* Direct Message CTA & Form (Celebim ef Card) */}
            {!isOwner && (
              <div className="rounded-2xl border-[1.5px] border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs">
                {currentUser && !isOwner ? (
                  <form onSubmit={handleSendMessage} className="space-y-2.5">
                    <label
                      htmlFor="direct-msg"
                      className="flex items-center gap-2 text-sm font-extrabold text-[var(--color-ink)]"
                    >
                      <MessageSquare size={15} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                      <span>إرسال رسالة عبر المنصة</span>
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
                      className="w-full p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] dark:bg-[var(--color-cream)]/40 text-xs sm:text-sm text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
                    />
                    <button
                      type="submit"
                      disabled={sendingMsg}
                      className="w-full rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] px-4 py-3 text-sm font-bold text-white transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      <MessageSquare size={15} aria-hidden="true" />
                      <span>{sendingMsg ? 'جاري الإرسال...' : 'إرسال رسالة للبائع'}</span>
                    </button>
                    {msgError && (
                      <p
                        role="alert"
                        className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
                      >
                        {msgError}
                      </p>
                    )}
                    {msgSuccess && (
                      <p className="text-xs font-semibold text-[var(--color-green-ink)]">
                        تم إرسال رسالتك بنجاح. تابع الرد من تبويب «المحادثات» في حسابي.
                      </p>
                    )}
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRequireAuth?.('login')}
                    className="w-full rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] px-4 py-3 text-sm font-bold text-white transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <MessageSquare size={15} aria-hidden="true" />
                    <span>سجّل الدخول لمراسلة البائع</span>
                  </button>
                )}
              </div>
            )}

            {/* Quick Price Offer Card (Celebim eg Card — when offers allowed) */}
            {allowsOffers && !isOwner && (
              <div className="rounded-2xl border-[1.5px] border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs">
                <div className="mb-3">
                  <h2 className="font-display text-sm font-extrabold text-[var(--color-ink)]">
                    تقديم عرض سعر (سوم)
                  </h2>
                  <p className="mt-0.5 text-[11px] leading-4 text-[var(--color-muted)]">
                    أدخل سعر السوم المقترح للرأس ليصل للمربي مباشرة في سجل التفاوض.
                  </p>
                </div>

                <form onSubmit={handleQuickOfferSubmit} className="flex w-full gap-2">
                  <div className="relative min-w-0 flex-1">
                    <input
                      type="number"
                      min="1"
                      placeholder={String(Math.round((listing.priceAmount * 0.92) / 10) * 10)}
                      value={quickOfferInput}
                      onChange={(e) => setQuickOfferInput(e.target.value)}
                      aria-label="قيمة السوم بالريال السعودي"
                      className="w-full rounded-xl border-[1.5px] border-[var(--color-border)] bg-[var(--color-surface-warm)] dark:bg-[var(--color-cream)]/40 py-2.5 pr-3 pl-10 text-sm font-bold text-[var(--color-ink)] outline-none transition-colors focus:border-[var(--color-gold)] tabular-nums"
                    />
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[11px] font-bold text-[var(--color-muted)]">
                      ر.س
                    </span>
                  </div>
                  <button
                    type="submit"
                    className="shrink-0 whitespace-nowrap rounded-xl bg-[var(--color-gold)] hover:bg-[var(--color-gold-hover)] px-4 py-2.5 text-xs font-extrabold text-[#10241B] transition-colors cursor-pointer"
                  >
                    سوم الآن
                  </button>
                </form>

                {offerSuccess && (
                  <p className="mt-2.5 text-xs font-semibold text-[var(--color-green-ink)] bg-[var(--color-gold-soft)]/50 border border-[var(--color-gold)]/40 rounded-lg px-3 py-2">
                    تم تسجيل عرض سعرك وإشعار المربي بنجاح.
                  </p>
                )}
              </div>
            )}

            {/* Quick Engagement Card (Like & Favorite) */}
            <div className="rounded-2xl border-[1.5px] border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-sm font-extrabold text-[var(--color-ink)]">
                <Heart size={15} className="text-[var(--color-gold)]" aria-hidden="true" />
                <span>تفاعل وحفظ العرض</span>
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">
                أعجب بالإعلان أو احفظه في المفضلة للرجوع إليه بسهولة لاحقاً.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!likesEnabled || !onToggleLike}
                  aria-pressed={isLiked}
                  onClick={() => onToggleLike?.(listing.id)}
                  className={`h-10 px-3 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 ${
                    isLiked
                      ? 'bg-[var(--color-gold-soft)]/70 border-[var(--color-gold)] text-[var(--color-green-ink)]'
                      : 'bg-[var(--color-surface-warm)] border-[var(--color-border)] text-[var(--color-ink)] hover:border-[var(--color-gold)]'
                  }`}
                >
                  <ThumbsUp
                    size={14}
                    aria-hidden="true"
                    className={isLiked ? 'fill-[var(--color-gold)] text-[var(--color-green-ink)]' : ''}
                  />
                  <span>{isLiked ? 'أعجبني' : 'إعجاب'}</span>
                  <span className="tabular-nums">({likesCount})</span>
                </button>

                <button
                  type="button"
                  aria-pressed={isFavorite}
                  onClick={() => onToggleFavorite(listing.id)}
                  className={`h-10 px-3 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    isFavorite
                      ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-300'
                      : 'bg-[var(--color-surface-warm)] border-[var(--color-border)] text-[var(--color-ink)] hover:border-[var(--color-gold)]'
                  }`}
                >
                  <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
                  <span>{isFavorite ? 'في المفضلة' : 'حفظ'}</span>
                </button>
              </div>
            </div>
          </aside>
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

        {/* Related Listings (Rendered with Celebim-inspired Showcase Cards) */}
        {relatedListings.length > 0 && (
          <section
            aria-labelledby="related-listings-heading"
            className="mt-10 pt-8 border-t border-[var(--color-border)]"
          >
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
              <div className="flex items-stretch gap-3">
                <span className="w-1 shrink-0 rounded-full bg-[var(--color-gold)]" aria-hidden="true" />
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
              </div>
              <button
                type="button"
                onClick={onBack}
                className="text-xs sm:text-sm font-bold text-[var(--color-green-ink)] hover:underline cursor-pointer self-start sm:self-auto"
              >
                تصفح جميع الإعلانات
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {relatedListings.map((item) => (
                <ListingCard
                  key={item.id}
                  listing={item}
                  variant="showcase"
                  currentUserId={currentUser?.id ?? null}
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

        {/* Compact Mobile Sticky Action Bar (Celebim ek Bar Layout) */}
        {!isOwner && isPublished && (
          <div
            className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur-md shadow-[0_-4px_16px_rgba(16,60,44,0.1)] p-3"
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
            aria-label="إجراءات التواصل السريعة"
          >
            <div className="flex items-center gap-2.5 max-w-[600px] mx-auto">
              <div className="flex-1 min-w-0">
                <p className="font-display text-lg font-black text-[var(--color-green-ink)] leading-none tabular-nums truncate">
                  {formatPriceSar(listing.priceAmount)}
                </p>
                <p className="text-[11px] font-semibold text-[var(--color-muted)] truncate mt-1 tabular-nums">
                  للرأس · {listing.quantity} رأس
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!currentUser ? (
                  <button
                    type="button"
                    onClick={() => onRequireAuth?.('login')}
                    className="min-h-[44px] px-4 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogIn size={14} aria-hidden="true" />
                    <span>تسجيل الدخول للتواصل</span>
                  </button>
                ) : (
                  <>
                    {allowsOffers && (
                      <button
                        type="button"
                        onClick={() => handleOpenOfferModal()}
                        className="min-h-[44px] px-3.5 rounded-xl bg-[var(--color-gold)] hover:bg-[var(--color-gold-hover)] text-[#10241B] text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <BadgeDollarSign size={15} aria-hidden="true" />
                        <span>سوم</span>
                      </button>
                    )}

                    {contactLinks.telHref ? (
                      <a
                        href={contactLinks.telHref}
                        aria-label="اتصال هاتفي بالبائع"
                        className="w-[44px] h-[44px] rounded-xl bg-[var(--color-gold-soft)] text-[var(--color-green-ink)] border border-[var(--color-gold)]/55 flex items-center justify-center shrink-0"
                      >
                        <Phone size={18} aria-hidden="true" />
                      </a>
                    ) : seller?.contactAvailable !== false && !revealedContact ? (
                      <button
                        type="button"
                        disabled={revealingContact}
                        onClick={handleRevealContact}
                        aria-label="إظهار رقم البائع"
                        className="w-[44px] h-[44px] rounded-xl bg-[var(--color-gold-soft)] text-[var(--color-green-ink)] border border-[var(--color-gold)]/55 flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-60"
                      >
                        <Phone size={18} aria-hidden="true" />
                      </button>
                    ) : null}

                    {contactLinks.whatsappHref ? (
                      <a
                        href={contactLinks.whatsappHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[44px] px-4 rounded-xl bg-[#1B7A3A] hover:bg-[#155f2c] text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
                      >
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                          <path d="M12.04 2a9.93 9.93 0 0 0-8.5 15.05L2 22l5.1-1.34A9.93 9.93 0 1 0 12.04 2Zm5.78 14.08c-.24.68-1.4 1.3-1.94 1.38-.5.07-1.13.1-1.82-.12-.42-.14-.96-.32-1.65-.62-2.9-1.25-4.79-4.18-4.93-4.37-.14-.2-1.18-1.57-1.18-3 0-1.42.74-2.12 1-2.41.27-.29.58-.36.77-.36h.56c.18 0 .42-.07.66.5.24.58.82 2 .9 2.14.07.14.12.31.02.5-.1.2-.15.32-.29.49-.15.17-.3.38-.44.51-.14.15-.3.3-.13.59.17.29.75 1.24 1.61 2.01 1.11.99 2.04 1.3 2.33 1.44.29.15.46.12.63-.07.17-.2.72-.84.91-1.13.2-.29.39-.24.65-.15.27.1 1.68.8 1.97.94.29.15.48.22.55.34.07.12.07.7-.17 1.38Z" />
                        </svg>
                        <span>واتساب</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={focusDirectMessageForm}
                        className="min-h-[44px] px-4 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <MessageSquare size={14} aria-hidden="true" />
                        <span>مراسلة</span>
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
