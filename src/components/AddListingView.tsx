import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Film,
  ImagePlus,
  Loader2,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import type {
  CommissionEligibility,
  CommissionSettings,
} from '../lib/commission';
import type {
  Breed,
  Category,
  Listing,
  LivestockSex,
  Region,
  UploadedMedia,
} from '../types/marketplace';
import { formatPriceSar, STOCK_GALLERY_OPTIONS } from '../lib/format';
import {
  computeHerdSummary,
  filterSubCategoriesByParent,
  validateExpectedPriceRule,
} from '../lib/listing-validation';
import { normalizeSaudiMobileClient } from '../lib/auth-validation';
import { api } from '../lib/api';
import { SafeImage } from './SafeImage';
import { Modal } from './Modal';
import { DynamicHeroBanner } from './DynamicHeroBanner';

const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_DURATION_SECONDS = 60;

interface DraftImageItem {
  key: string;
  url: string;
  label: string;
  mediaId?: string;
  sizeBytes?: number;
}

interface AddListingViewProps {
  categories: Category[];
  breeds: Breed[];
  regions: Region[];
  isAdmin: boolean;
  currentUserPhone?: string | null;
  onProfileCompleted?: () => Promise<void> | void;
  editingListing?: Listing | null;
  commissionSettings?: CommissionSettings | null;
  commissionEligibility?: CommissionEligibility | null;
  onCreate: (payload: Record<string, unknown>) => Promise<void>;
  onUpdate?: (listingId: string, payload: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  onGoHome?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  pendingExternalNavigation?: boolean;
  onConfirmExternalNavigation?: () => void;
  onCancelExternalNavigation?: () => void;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}

function readVideoDurationSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
      resolve(null);
      return;
    }
    const videoEl = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    let settled = false;

    const finish = (val: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      videoEl.removeAttribute('src');
      videoEl.load();
      resolve(val);
    };

    const timer = window.setTimeout(() => finish(null), 4000);
    videoEl.preload = 'metadata';
    videoEl.onloadedmetadata = () => {
      window.clearTimeout(timer);
      const dur = videoEl.duration;
      finish(Number.isFinite(dur) && dur > 0 ? dur : null);
    };
    videoEl.onerror = () => {
      window.clearTimeout(timer);
      finish(null);
    };
    videoEl.src = objectUrl;
  });
}

export function AddListingView({
  categories,
  breeds,
  regions,
  isAdmin,
  currentUserPhone,
  onProfileCompleted,
  editingListing = null,
  commissionSettings = null,
  commissionEligibility = null,
  onCreate,
  onUpdate,
  onCancel,
  onGoHome,
  onDirtyChange,
  pendingExternalNavigation = false,
  onConfirmExternalNavigation,
  onCancelExternalNavigation,
}: AddListingViewProps) {
  const isEditing = Boolean(editingListing);
  const needsPhoneCompletion = !isEditing && currentUserPhone === null;
  const [completionPhone, setCompletionPhone] = useState('');
  const [completionBusy, setCompletionBusy] = useState(false);
  const [completionError, setCompletionError] = useState('');
  const mainCategories = useMemo(
    () => categories.filter((c) => c.parentId === null),
    [categories]
  );

  const initialCategoryId = editingListing?.categoryId || mainCategories[0]?.id || 'cat_sheep';
  const initialFilteredSubs = useMemo(
    () => filterSubCategoriesByParent(categories, initialCategoryId),
    [categories, initialCategoryId]
  );
  const initialSubCategoryId =
    editingListing?.subCategoryId &&
    initialFilteredSubs.some((sub) => sub.id === editingListing.subCategoryId)
      ? editingListing.subCategoryId
      : 'auto';
  const initialBreedId = editingListing?.breedId || breeds[0]?.id || 'brd_naimi';
  const initialRegionId = editingListing?.regionId || regions[0]?.id || 'reg_riyadh';
  const initialCity = editingListing?.city || 'الرياض';
  const initialTitle = editingListing?.title || '';
  const initialPriceAmount = editingListing ? String(editingListing.priceAmount) : '1800';
  const initialExpectedPrice = editingListing
    ? editingListing.expectedPrice
      ? String(editingListing.expectedPrice)
      : ''
    : '1700';
  const initialSex: LivestockSex = editingListing?.sex || 'ذكر';
  const initialAgeMonths = editingListing ? String(editingListing.ageMonths) : '8';
  const initialWeightKg = editingListing ? String(editingListing.weightKg) : '45';
  const initialQuantity = editingListing ? String(editingListing.quantity) : '1';
  const initialIsNegotiable = editingListing ? editingListing.isNegotiable : true;
  const initialAllowPriceOffers = editingListing
    ? editingListing.allowPriceOffers !== undefined
      ? editingListing.allowPriceOffers
      : editingListing.isNegotiable
    : true;
  const initialVaccinated = editingListing ? editingListing.vaccinated : true;
  const initialDescription = editingListing?.description || '';

  const initialImages = useMemo<DraftImageItem[]>(
    () =>
      editingListing
        ? [...(editingListing.images || [])]
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((img, idx) => ({
              key: img.mediaId || img.id || `init-${idx}`,
              url: img.url,
              label: img.mediaId ? `صورة مرفوعة ${idx + 1}` : `صورة ${idx + 1}`,
              mediaId: img.mediaId,
            }))
        : [],
    [editingListing]
  );

  const initialVideo = useMemo<UploadedMedia | null>(
    () =>
      editingListing?.video?.url && editingListing.video.mediaId
        ? {
            id: editingListing.video.mediaId,
            url: editingListing.video.url,
            kind: 'video',
            mimeType: editingListing.video.mimeType,
            sizeBytes: editingListing.video.sizeBytes,
            originalName: editingListing.video.originalName || 'فيديو الإعلان',
            createdAt: editingListing.updatedAt,
          }
        : null,
    [editingListing]
  );

  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [subCategoryId, setSubCategoryId] = useState(initialSubCategoryId);
  const [breedId, setBreedId] = useState(initialBreedId);
  const [regionId, setRegionId] = useState(initialRegionId);
  const [city, setCity] = useState(initialCity);
  const [title, setTitle] = useState(initialTitle);
  const [priceAmount, setPriceAmount] = useState(initialPriceAmount);
  const [expectedPrice, setExpectedPrice] = useState(initialExpectedPrice);
  const [sex, setSex] = useState<LivestockSex>(initialSex);
  const [ageMonths, setAgeMonths] = useState(initialAgeMonths);
  const [weightKg, setWeightKg] = useState(initialWeightKg);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [isNegotiable, setIsNegotiable] = useState(initialIsNegotiable);
  const [allowPriceOffers, setAllowPriceOffers] = useState(initialAllowPriceOffers);
  const [vaccinated, setVaccinated] = useState(initialVaccinated);
  const [description, setDescription] = useState(initialDescription);

  const initialMediaIds = useMemo(() => {
    const ids = new Set<string>();
    if (editingListing) {
      for (const img of editingListing.images || []) {
        if (img.mediaId) ids.add(img.mediaId);
      }
      if (editingListing.video?.mediaId) {
        ids.add(editingListing.video.mediaId);
      }
    }
    return ids;
  }, [editingListing]);

  // Media state: real uploaded photos + optional stock gallery + optional 1 video
  const [selectedImages, setSelectedImages] = useState<DraftImageItem[]>(initialImages);
  const [uploadedVideo, setUploadedVideo] = useState<UploadedMedia | null>(initialVideo);
  const [uploadingImagesCount, setUploadingImagesCount] = useState(0);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [imageDragOver, setImageDragOver] = useState(false);
  const [videoDragOver, setVideoDragOver] = useState(false);
  const [showStockPicker, setShowStockPicker] = useState(false);
  const [mediaError, setMediaError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [savedSuccessfully, setSavedSuccessfully] = useState(false);
  const [error, setError] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const requiresCommissionPledge =
    !isAdmin && (!isEditing || editingListing?.status === 'Draft');
  const [commissionPledgeAccepted, setCommissionPledgeAccepted] = useState<boolean>(
    Boolean(
      editingListing?.commissionPledgeAccepted ||
        (isEditing && editingListing?.status !== 'Draft')
    )
  );
  const [featuredRequested, setFeaturedRequested] = useState<boolean>(
    Boolean(editingListing?.featuredRequested)
  );

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  // Tracks ONLY media uploaded during this unsaved session (never initialMediaIds of saved listings)
  const sessionUploadedIdsRef = useRef<Set<string>>(new Set());
  const formTargetKey = editingListing?.id || '__new__';
  const activeFormKeyRef = useRef(formTargetKey);
  activeFormKeyRef.current = formTargetKey;
  const lastSyncedKeyRef = useRef(formTargetKey);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (lastSyncedKeyRef.current === formTargetKey) return;
    lastSyncedKeyRef.current = formTargetKey;

    const orphanedIds = Array.from(sessionUploadedIdsRef.current);
    sessionUploadedIdsRef.current.clear();
    for (const id of orphanedIds) {
      if (!initialMediaIds.has(id)) {
        api.deleteMedia(id).catch(() => {});
      }
    }

    setCategoryId(initialCategoryId);
    setSubCategoryId(initialSubCategoryId);
    setBreedId(initialBreedId);
    setRegionId(initialRegionId);
    setCity(initialCity);
    setTitle(initialTitle);
    setPriceAmount(initialPriceAmount);
    setExpectedPrice(initialExpectedPrice);
    setSex(initialSex);
    setAgeMonths(initialAgeMonths);
    setWeightKg(initialWeightKg);
    setQuantity(initialQuantity);
    setIsNegotiable(initialIsNegotiable);
    setAllowPriceOffers(initialAllowPriceOffers);
    setVaccinated(initialVaccinated);
    setDescription(initialDescription);
    setSelectedImages(initialImages);
    setUploadedVideo(initialVideo);
    setUploadingImagesCount(0);
    setUploadingVideo(false);
    setImageDragOver(false);
    setVideoDragOver(false);
    setShowStockPicker(false);
    setMediaError('');
    setSubmitting(false);
    submittingRef.current = false;
    setSavedSuccessfully(false);
    setError('');
    setShowCancelModal(false);
    setCommissionPledgeAccepted(
      Boolean(
        editingListing?.commissionPledgeAccepted ||
          (isEditing && editingListing?.status !== 'Draft')
      )
    );
    setFeaturedRequested(Boolean(editingListing?.featuredRequested));
    onDirtyChange?.(false);
  }, [
    formTargetKey,
    initialMediaIds,
    initialCategoryId,
    initialSubCategoryId,
    initialBreedId,
    initialRegionId,
    initialCity,
    initialTitle,
    initialPriceAmount,
    initialExpectedPrice,
    initialSex,
    initialAgeMonths,
    initialWeightKg,
    initialQuantity,
    initialIsNegotiable,
    initialAllowPriceOffers,
    initialVaccinated,
    initialDescription,
    initialImages,
    initialVideo,
    onDirtyChange,
  ]);

  const filteredSubCategories = useMemo(
    () => filterSubCategoriesByParent(categories, categoryId),
    [categories, categoryId]
  );

  const filteredBreeds = useMemo(
    () => breeds.filter((b) => b.categoryId === categoryId),
    [breeds, categoryId]
  );

  const expectedPriceValidation = useMemo(
    () => validateExpectedPriceRule({ priceAmount, expectedPrice }),
    [priceAmount, expectedPrice]
  );

  const herdSummary = useMemo(
    () => computeHerdSummary({ priceAmount, expectedPrice, quantity }),
    [priceAmount, expectedPrice, quantity]
  );

  const initialImageSignature = useMemo(
    () => initialImages.map((img) => img.key).join('|'),
    [initialImages]
  );
  const currentImageSignature = useMemo(
    () => selectedImages.map((img) => img.key).join('|'),
    [selectedImages]
  );

  const isDirty = useMemo(() => {
    if (savedSuccessfully) return false;
    return (
      categoryId !== initialCategoryId ||
      subCategoryId !== initialSubCategoryId ||
      breedId !== initialBreedId ||
      regionId !== initialRegionId ||
      city !== initialCity ||
      title !== initialTitle ||
      priceAmount !== initialPriceAmount ||
      expectedPrice !== initialExpectedPrice ||
      sex !== initialSex ||
      ageMonths !== initialAgeMonths ||
      weightKg !== initialWeightKg ||
      quantity !== initialQuantity ||
      isNegotiable !== initialIsNegotiable ||
      allowPriceOffers !== initialAllowPriceOffers ||
      vaccinated !== initialVaccinated ||
      description !== initialDescription ||
      currentImageSignature !== initialImageSignature ||
      (uploadedVideo?.id || null) !== (initialVideo?.id || null)
    );
  }, [
    savedSuccessfully,
    categoryId,
    initialCategoryId,
    subCategoryId,
    initialSubCategoryId,
    breedId,
    initialBreedId,
    regionId,
    initialRegionId,
    city,
    initialCity,
    title,
    initialTitle,
    priceAmount,
    initialPriceAmount,
    expectedPrice,
    initialExpectedPrice,
    sex,
    initialSex,
    ageMonths,
    initialAgeMonths,
    weightKg,
    initialWeightKg,
    quantity,
    initialQuantity,
    isNegotiable,
    initialIsNegotiable,
    allowPriceOffers,
    initialAllowPriceOffers,
    vaccinated,
    initialVaccinated,
    description,
    initialDescription,
    currentImageSignature,
    initialImageSignature,
    uploadedVideo?.id,
    initialVideo?.id,
  ]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!isDirty || submitting || typeof window === 'undefined') return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, submitting]);

  const cleanupSessionDraftUploads = () => {
    const idsToDelete = Array.from(sessionUploadedIdsRef.current);
    sessionUploadedIdsRef.current.clear();
    for (const id of idsToDelete) {
      if (!initialMediaIds.has(id)) {
        api.deleteMedia(id).catch(() => {});
      }
    }
  };

  const handleRequestCancel = () => {
    if (submitting) return;
    if (isDirty || sessionUploadedIdsRef.current.size > 0) {
      setShowCancelModal(true);
      return;
    }
    onCancel();
  };

  const handleKeepEditing = () => {
    setShowCancelModal(false);
    if (pendingExternalNavigation) {
      onCancelExternalNavigation?.();
    }
  };

  const handleConfirmDiscard = () => {
    setShowCancelModal(false);
    cleanupSessionDraftUploads();
    onDirtyChange?.(false);
    if (pendingExternalNavigation && onConfirmExternalNavigation) {
      onConfirmExternalNavigation();
    } else {
      onCancel();
    }
  };

  const handleUploadImageFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setMediaError('');
    const remainingSlots = MAX_IMAGES - selectedImages.length;
    if (remainingSlots <= 0) {
      setMediaError(`الحد الأقصى للصور هو ${MAX_IMAGES} صور لكل إعلان`);
      return;
    }

    const batch = fileArray.slice(0, remainingSlots);
    if (fileArray.length > remainingSlots) {
      setMediaError(`تم قبول أول ${remainingSlots} صور فقط لأن الحد الأقصى ${MAX_IMAGES} صور`);
    }

    const validFiles: File[] = [];
    for (const file of batch) {
      const lower = file.name.toLowerCase();
      const isSupportedExt = /\.(jpe?g|png|webp)$/.test(lower);
      const isSupportedMime = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
      if (!isSupportedMime && !isSupportedExt) {
        setMediaError('صيغة الصورة غير مدعومة. الصيغ المسموحة: JPG، PNG، WebP');
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setMediaError(`الصورة «${file.name}» تتجاوز الحد الأقصى المسموح (5 ميجابايت)`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    const uploadTargetKey = activeFormKeyRef.current;
    setUploadingImagesCount((c) => c + validFiles.length);
    for (const file of validFiles) {
      try {
        const res = await api.uploadMedia(file, 'image');
        if (activeFormKeyRef.current !== uploadTargetKey) {
          api.deleteMedia(res.media.id).catch(() => {});
          continue;
        }
        if (!initialMediaIds.has(res.media.id)) {
          sessionUploadedIdsRef.current.add(res.media.id);
        }
        setSelectedImages((prev) => {
          if (prev.length >= MAX_IMAGES) return prev;
          return [
            ...prev,
            {
              key: res.media.id,
              url: res.media.url,
              label: res.media.originalName || file.name,
              mediaId: res.media.id,
              sizeBytes: res.media.sizeBytes,
            },
          ];
        });
      } catch (err: any) {
        if (activeFormKeyRef.current === uploadTargetKey) {
          setMediaError(err?.message || `تعذر رفع الصورة ${file.name}`);
        }
      } finally {
        if (activeFormKeyRef.current === uploadTargetKey) {
          setUploadingImagesCount((c) => Math.max(0, c - 1));
        }
      }
    }
  };

  const handleUploadVideoFile = async (files: FileList | File[]) => {
    const file = Array.from(files)[0];
    if (!file) return;

    setMediaError('');
    const lower = file.name.toLowerCase();
    const isSupportedExt = /\.(mp4|mov|webm)$/.test(lower);
    const isSupportedMime = ['video/mp4', 'video/quicktime', 'video/webm'].includes(file.type);
    if (!isSupportedMime && !isSupportedExt) {
      setMediaError('صيغة الفيديو غير مدعومة. الصيغ المسموحة: MP4، MOV، WebM');
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setMediaError('حجم الفيديو يتجاوز الحد الأقصى المسموح (25 ميجابايت)');
      return;
    }

    const duration = await readVideoDurationSeconds(file);
    if (duration !== null && duration > MAX_VIDEO_DURATION_SECONDS) {
      setMediaError(`مدة الفيديو (${Math.round(duration)} ثانية) تتجاوز الحد المسموح (60 ثانية)`);
      return;
    }

    const uploadTargetKey = activeFormKeyRef.current;
    const previousVideoId = uploadedVideo?.id;
    setUploadingVideo(true);
    try {
      const res = await api.uploadMedia(file, 'video');
      if (activeFormKeyRef.current !== uploadTargetKey) {
        api.deleteMedia(res.media.id).catch(() => {});
        return;
      }
      if (!initialMediaIds.has(res.media.id)) {
        sessionUploadedIdsRef.current.add(res.media.id);
      }
      setUploadedVideo(res.media);
      if (previousVideoId && !initialMediaIds.has(previousVideoId)) {
        sessionUploadedIdsRef.current.delete(previousVideoId);
        api.deleteMedia(previousVideoId).catch(() => {});
      }
    } catch (err: any) {
      if (activeFormKeyRef.current === uploadTargetKey) {
        setMediaError(err?.message || 'تعذر رفع الفيديو، حاول مرة أخرى');
      }
    } finally {
      if (activeFormKeyRef.current === uploadTargetKey) {
        setUploadingVideo(false);
      }
    }
  };

  const handleRemoveImage = (index: number) => {
    const target = selectedImages[index];
    setSelectedImages((prev) => prev.filter((_, idx) => idx !== index));
    if (target?.mediaId && !initialMediaIds.has(target.mediaId)) {
      sessionUploadedIdsRef.current.delete(target.mediaId);
      api.deleteMedia(target.mediaId).catch(() => {});
    }
  };

  const handleSetCover = (index: number) => {
    if (index <= 0 || index >= selectedImages.length) return;
    setSelectedImages((prev) => {
      const copy = [...prev];
      const [picked] = copy.splice(index, 1);
      copy.unshift(picked);
      return copy;
    });
  };

  const handleMoveImage = (index: number, delta: -1 | 1) => {
    const nextIdx = index + delta;
    if (nextIdx < 0 || nextIdx >= selectedImages.length) return;
    setSelectedImages((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[nextIdx];
      copy[nextIdx] = temp;
      return copy;
    });
  };

  const handleToggleStockImage = (url: string, label: string) => {
    setMediaError('');
    setSelectedImages((prev) => {
      const existsIdx = prev.findIndex((item) => !item.mediaId && item.url === url);
      if (existsIdx !== -1) {
        return prev.filter((_, i) => i !== existsIdx);
      }
      if (prev.length >= MAX_IMAGES) {
        setMediaError(`الحد الأقصى للصور هو ${MAX_IMAGES} صور لكل إعلان`);
        return prev;
      }
      return [
        ...prev,
        {
          key: `stock:${url}`,
          url,
          label,
        },
      ];
    });
  };

  const handleRemoveVideo = () => {
    if (!uploadedVideo) return;
    const videoId = uploadedVideo.id;
    setUploadedVideo(null);
    if (!initialMediaIds.has(videoId)) {
      sessionUploadedIdsRef.current.delete(videoId);
      api.deleteMedia(videoId).catch(() => {});
    }
  };

  const submitListingForm = async (requestedStatus?: 'Draft' | 'Pending') => {
    if (submittingRef.current || submitting) return;
    setError('');
    if (!title.trim() || !Number.isFinite(Number(priceAmount)) || Number(priceAmount) <= 0) {
      setError('يرجى إدخال عنوان واضح وسعر صحيح بالريال السعودي');
      return;
    }
    if (!expectedPriceValidation.ok) {
      setError(expectedPriceValidation.error);
      return;
    }
    if (!herdSummary.isValidQuantity) {
      setError('يرجى إدخال عدد رؤوس صحيح يساوي ١ أو أكثر');
      return;
    }
    if (uploadingImagesCount > 0 || uploadingVideo) {
      setError('يرجى الانتظار حتى يكتمل رفع الصور والفيديو');
      return;
    }
    if (selectedImages.length === 0) {
      setError('يرجى رفع صورة واحدة على الأقل للحلال من جهازك أو اختيار صورة من المعرض');
      return;
    }
    if (requiresCommissionPledge && requestedStatus !== 'Draft' && !commissionPledgeAccepted) {
      setError('يرجى الموافقة على إقرار الأمانة بدفع عمولة الموقع قبل إرسال الإعلان للنشر');
      return;
    }

    const payload: Record<string, unknown> = {
      categoryId,
      subCategoryId,
      breedId,
      regionId,
      city: city.trim(),
      title: title.trim(),
      priceAmount: Number(priceAmount),
      expectedPrice: expectedPriceValidation.value,
      sex,
      ageMonths: Number(ageMonths),
      weightKg: Number(weightKg),
      quantity: Number(quantity),
      isNegotiable: isNegotiable || allowPriceOffers,
      allowPriceOffers,
      vaccinated,
      description: description.trim(),
      images: selectedImages.map((img, idx) => ({
        url: img.url,
        position: idx + 1,
        ...(img.mediaId ? { mediaId: img.mediaId } : {}),
      })),
      imageUrls: selectedImages.map((img) => img.url),
      videoMediaId: uploadedVideo ? uploadedVideo.id : null,
      commissionPledgeAccepted: isAdmin ? true : commissionPledgeAccepted,
      featuredRequested,
    };

    if (requestedStatus === 'Draft') {
      payload.status = 'Draft';
    } else if (
      isEditing &&
      editingListing &&
      (editingListing.status === 'Rejected' ||
        editingListing.status === 'Draft' ||
        editingListing.status === 'Expired')
    ) {
      payload.status = isAdmin ? 'Published' : 'Pending';
    }

    const submitTargetKey = activeFormKeyRef.current;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      // Clear session draft tracking and dirty flag before handler navigates away on success
      const uploadedBeforeSave = Array.from(sessionUploadedIdsRef.current);
      if (isEditing && editingListing && onUpdate) {
        setSavedSuccessfully(true);
        sessionUploadedIdsRef.current.clear();
        onDirtyChange?.(false);
        try {
          await onUpdate(editingListing.id, payload);
        } catch (err) {
          if (activeFormKeyRef.current === submitTargetKey) {
            setSavedSuccessfully(false);
            for (const id of uploadedBeforeSave) sessionUploadedIdsRef.current.add(id);
            onDirtyChange?.(true);
          }
          throw err;
        }
        const keptIds = new Set(
          selectedImages.map((img) => img.mediaId).filter((id): id is string => Boolean(id))
        );
        if (uploadedVideo?.id) keptIds.add(uploadedVideo.id);
        for (const oldId of initialMediaIds) {
          if (!keptIds.has(oldId)) {
            api.deleteMedia(oldId).catch(() => {});
          }
        }
      } else {
        setSavedSuccessfully(true);
        sessionUploadedIdsRef.current.clear();
        onDirtyChange?.(false);
        try {
          await onCreate(payload);
        } catch (err) {
          if (activeFormKeyRef.current === submitTargetKey) {
            setSavedSuccessfully(false);
            for (const id of uploadedBeforeSave) sessionUploadedIdsRef.current.add(id);
            onDirtyChange?.(true);
          }
          throw err;
        }
      }
    } catch (err: any) {
      if (activeFormKeyRef.current === submitTargetKey) {
        setError(err?.message || 'تعذر حفظ الإعلان');
      }
    } finally {
      if (activeFormKeyRef.current === submitTargetKey) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitListingForm();
  };

  const inputCls =
    'w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/75 focus:outline-none focus:border-[var(--color-green-ink)] focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/50 transition-colors';

  const isUploadingAny = uploadingImagesCount > 0 || uploadingVideo;
  const leaveModalOpen = showCancelModal || pendingExternalNavigation;

  const step1Done = Boolean(categoryId && breedId && regionId && city.trim());
  const step2Done = Boolean(
    title.trim() &&
      Number(priceAmount) > 0 &&
      expectedPriceValidation.ok &&
      herdSummary.isValidQuantity &&
      description.trim()
  );
  const step3Done = selectedImages.length > 0;

  const pledgeReady = !requiresCommissionPledge || commissionPledgeAccepted;
  const readinessCompletedCount = [step1Done, step2Done, step3Done, pledgeReady].filter(Boolean).length;
  const readinessPercent = Math.round((readinessCompletedCount / 4) * 100);

  return (
    <section className="bg-[var(--color-canvas)] transition-colors overflow-x-hidden">
      {/* Architectural Masthead Banner with Live Listing Readiness Blueprint & Card Preview */}
      <DynamicHeroBanner
        pageKey="add"
        variant="night-vault"
        compact
        breadcrumbs={[
          { label: 'الرئيسية', onClick: onGoHome || handleRequestCancel },
          { label: isEditing ? 'تعديل الإعلان' : 'إضافة إعلان جديد' },
        ]}
        contextLabel={
          isDirty
            ? 'تغييرات غير محفوظة'
            : isAdmin
            ? 'نشر فوري بصلاحية المشرف'
            : 'توثيق ومراجعة إدارية'
        }
        eyebrow={isEditing ? 'تحديث بيانات العرض والميديا' : 'نموذج النشر الاحترافي'}
        title={isEditing ? 'تعديل' : 'إضافة'}
        titleAccent={isEditing ? 'الإعلان' : 'إعلان جديد'}
        subHeadline={
          isEditing
            ? editingListing?.status === 'Rejected'
              ? 'صحّح الملاحظات المطلوبة واحفظ الإعلان لإعادة إرساله إلى قائمة المراجعة الإدارية.'
              : editingListing?.status === 'Published' && !isAdmin
              ? 'تنبيه: التعديلات الجوهرية على العنوان أو الوصف أو السعر أو المواصفات أو الصور والفيديو تعيد الإعلان إلى المراجعة الإدارية قبل الظهور مجدداً.'
              : 'حدّث بيانات الإعلان أو أعد ترتيب الصور واختر صورة الغلاف أو أضف فيديو قصيراً ثم احفظ التعديلات.'
            : isAdmin
            ? 'سيتم نشر الإعلان مباشرة بصلاحية المشرف فور استكمال الحقول المطلوبة.'
            : 'أدخل البيانات المنظمة بدقة وأرفق صوراً واضحة للحلال؛ يمر الإعلان بمراجعة المشرفين قبل الظهور في القائمة العامة.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleRequestCancel}
              disabled={submitting}
              className="min-h-[42px] inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/25 bg-white/[0.08] hover:border-[#F4C569] text-xs sm:text-sm font-semibold text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              <ArrowRight size={15} aria-hidden="true" />
              <span>{isEditing ? 'العودة إلى الإعلان' : 'رجوع / إلغاء'}</span>
            </button>
            {isDirty && (
              <div
                role="status"
                className="min-h-[38px] inline-flex items-center px-3 py-1.5 rounded-xl bg-[#F4C569]/15 border border-[#F4C569]/55 text-xs font-bold text-[#F4C569]"
              >
                تغييرات غير محفوظة
              </div>
            )}
          </div>
        }
        visual={
          <div className="flex flex-col justify-between h-full gap-3">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/15">
              <span className="text-xs font-extrabold text-white">
                معاينة حية لبطاقة إعلانك
              </span>
              <span className="font-display text-xs font-extrabold text-[#F4C569] tabular-nums">
                جاهزية {readinessPercent}% ({readinessCompletedCount}/4)
              </span>
            </div>

            {/* Live Mini Card Preview */}
            <div className="p-2.5 rounded-xl bg-white/[0.06] border border-white/15 flex items-center gap-3">
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-[#081C14] border border-white/15 shrink-0 flex items-center justify-center">
                {selectedImages[0]?.url ? (
                  <SafeImage
                    src={selectedImages[0].url}
                    alt={title.trim() || 'معاينة صورة الإعلان'}
                    width={96}
                    height={96}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImagePlus size={20} className="text-[#F4C569]/70" aria-hidden="true" />
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-[#F4C569] text-[#0B231A] text-[10px] font-extrabold shrink-0">
                    {isEditing ? 'تحديث' : 'جديد'}
                  </span>
                  <span className="text-[10px] text-emerald-100/75 truncate">
                    {breeds.find((b) => b.id === breedId)?.name || 'السلالة'} ·{' '}
                    {city.trim() || regions.find((r) => r.id === regionId)?.name || 'الموقع'}
                  </span>
                </div>
                <p className="font-display text-xs font-extrabold text-white truncate">
                  {title.trim() || 'عنوان العرض سيظهر هنا تلقائياً...'}
                </p>
                <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
                  <span className="font-extrabold text-[#F4C569]">
                    {Number(priceAmount) > 0 ? formatPriceSar(Number(priceAmount)) : '—'}
                  </span>
                  <span className="text-emerald-100/75">
                    {Number(quantity) > 1
                      ? `${quantity} رأس · الإجمالي ${formatPriceSar(herdSummary.totalAskingValue || 0)}`
                      : `${ageMonths || 8} أشهر · ${weightKg || 45} كجم`}
                  </span>
                </div>
              </div>
            </div>

            <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
              <div
                className="h-full bg-[#F4C569] transition-all duration-300"
                style={{ width: `${readinessPercent}%` }}
              />
            </div>
          </div>
        }
        interactiveDock={
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { href: '#step-classification', label: 'التصنيف والموقع', done: step1Done },
              { href: '#step-details', label: 'السعر والمواصفات', done: step2Done },
              { href: '#step-media', label: 'الصور والفيديو', done: step3Done },
              { href: '#step-media', label: 'تعهد العمولة', done: pledgeReady },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={`min-h-[34px] px-2.5 py-1.5 rounded-lg border text-[11px] font-bold flex items-center justify-between gap-1.5 transition-colors ${
                  item.done
                    ? 'bg-[#F4C569]/18 border-[#F4C569]/55 text-[#F4C569]'
                    : 'bg-white/[0.06] border-white/15 text-emerald-100/80 hover:border-[#F4C569]/55'
                }`}
              >
                <span className="truncate">{item.label}</span>
                {item.done ? (
                  <Check size={13} className="shrink-0" aria-hidden="true" />
                ) : (
                  <span className="text-[10px] opacity-70 shrink-0">○</span>
                )}
              </a>
            ))}
          </div>
        }
      />

      <div className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6">
        {isEditing && editingListing?.status === 'Rejected' && editingListing.rejectionReason && (
        <div
          role="note"
          className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-800 dark:text-red-300"
        >
          <span className="font-bold">سبب الرفض المسجل: </span>
          <span>{editingListing.rejectionReason}</span>
        </div>
      )}

      {/* Step Progress & Phone Completion */}
      <div className="bg-[var(--color-cream)] rounded-2xl border border-[var(--color-border)] p-4 sm:p-5 space-y-4">


        {needsPhoneCompletion && (
          <div
            role="region"
            aria-label="إكمال بيانات الحساب"
            className="rounded-xl border border-[var(--color-gold)] bg-[var(--color-surface)] p-4 sm:p-5 space-y-3"
          >
            <div className="space-y-1">
              <h2 className="font-display text-base font-bold text-[var(--color-ink)]">
                إكمال بيانات الحساب قبل نشر الإعلان
              </h2>
              <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                لأنك سجلت عبر Google، يلزم إضافة رقم جوال سعودي صالح (05XXXXXXXX) لتمكين المشترين الموثقين من التواصل معك حول إعلاناتك.
              </p>
            </div>
            {completionError && (
              <p
                role="alert"
                className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
              >
                {completionError}
              </p>
            )}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <input
                type="tel"
                dir="ltr"
                value={completionPhone}
                onChange={(e) => setCompletionPhone(e.target.value)}
                placeholder="05XXXXXXXX"
                aria-label="رقم الجوال السعودي لإكمال بيانات الحساب"
                className="flex-1 h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] text-right tabular-nums focus:outline-none focus:border-[var(--color-green-ink)]"
              />
              <button
                type="button"
                disabled={completionBusy}
                onClick={async () => {
                  setCompletionError('');
                  const normalized = normalizeSaudiMobileClient(completionPhone);
                  if (!normalized) {
                    setCompletionError('رقم الجوال غير صحيح، استخدم صيغة جوال سعودي مثل 05XXXXXXXX');
                    return;
                  }
                  setCompletionBusy(true);
                  try {
                    await api.completeProfile({ phone: normalized });
                    setCompletionPhone('');
                    await onProfileCompleted?.();
                  } catch (err: any) {
                    setCompletionError(err?.message || 'تعذر حفظ رقم الجوال');
                  } finally {
                    setCompletionBusy(false);
                  }
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] disabled:opacity-60 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors shrink-0"
              >
                {completionBusy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                <span>{completionBusy ? 'جاري الحفظ...' : 'حفظ رقم الجوال والمتابعة'}</span>
              </button>
            </div>
          </div>
        )}

        {/* 3-Step Visual Progress Bar */}
        <nav
          aria-label="خطوات إعداد الإعلان"
          className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-[var(--color-border)]"
        >
          {[
            { href: '#step-classification', num: '1', label: 'التصنيف والموقع', done: step1Done },
            { href: '#step-details', num: '2', label: 'التفاصيل والسعر', done: step2Done },
            { href: '#step-media', num: '3', label: 'الصور والفيديو', done: step3Done },
          ].map((step) => (
            <a
              key={step.num}
              href={step.href}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-green-ink)] transition-colors flex items-center justify-between gap-2 text-xs font-semibold text-[var(--color-ink)]"
            >
              <span className="inline-flex items-center gap-2 min-w-0">
                <span
                  className={`w-6 h-6 rounded-lg text-[11px] font-extrabold tabular-nums flex items-center justify-center shrink-0 ${
                    step.done
                      ? 'bg-[var(--color-green)] text-white'
                      : 'bg-[var(--color-cream)] border border-[var(--color-border)] text-[var(--color-muted)]'
                  }`}
                >
                  {step.num}
                </span>
                <span className="truncate">{step.label}</span>
              </span>
              <span
                className={`text-[11px] font-semibold shrink-0 ${
                  step.done ? 'text-[var(--color-green-ink)]' : 'text-[var(--color-muted)]'
                }`}
              >
                {step.done ? 'مكتمل' : 'مطلوب'}
              </span>
            </a>
          ))}
        </nav>
      </div>

      {/* Sticky Mobile Compact 3-Step Jump Bar */}
      <div
        aria-label="تنقل سريع بين خطوات الإعلان"
        className="sm:hidden sticky top-[65px] z-20 -mx-3 px-3 py-2 bg-[var(--color-canvas)]/95 backdrop-blur-md border-y border-[var(--color-border)] flex items-center gap-2 overflow-x-auto no-scrollbar"
      >
        {[
          { href: '#step-classification', num: '1', label: 'التصنيف', done: step1Done },
          { href: '#step-details', num: '2', label: 'السعر والمواصفات', done: step2Done },
          { href: '#step-media', num: '3', label: 'الصور والفيديو', done: step3Done },
        ].map((step) => (
          <a
            key={step.num}
            href={step.href}
            className={`min-h-[38px] px-3 py-1 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              step.done
                ? 'bg-[var(--color-green)] text-white border-[var(--color-green)]'
                : 'bg-[var(--color-surface)] text-[var(--color-ink)] border-[var(--color-border)]'
            }`}
          >
            <span className="tabular-nums font-extrabold">{step.num}.</span>
            <span>{step.label}</span>
          </a>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div
            role="alert"
            className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-sm text-red-800 dark:text-red-300"
          >
            {error}
          </div>
        )}

        {/* Section 1: Classification & Location */}
        <div
          id="step-classification"
          className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4 sm:p-6 space-y-5 scroll-mt-32 sm:scroll-mt-20"
        >
          <div className="flex items-center gap-3 pb-4 border-b border-[var(--color-border)]">
            <span className="w-8 h-8 rounded-xl bg-[var(--color-green)] text-white font-display text-sm font-extrabold tabular-nums flex items-center justify-center shrink-0">
              1
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
                1. التصنيف والموقع
              </h2>
              <p className="text-xs text-[var(--color-muted)]">
                حدد نوع الحلال والسلالة والمنطقة الجغرافية لتسهيل وصول المشترين لإعلانك.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="add-cat"
                className="block text-xs font-semibold text-[var(--color-ink)] mb-1.5"
              >
                التصنيف الرئيسي
              </label>
              <select
                id="add-cat"
                value={categoryId}
                onChange={(e) => {
                  const nextCat = e.target.value;
                  setCategoryId(nextCat);
                  const nextSubs = filterSubCategoriesByParent(categories, nextCat);
                  if (subCategoryId !== 'auto' && !nextSubs.some((s) => s.id === subCategoryId)) {
                    setSubCategoryId('auto');
                  }
                  const firstBreed = breeds.find((b) => b.categoryId === nextCat);
                  if (firstBreed) setBreedId(firstBreed.id);
                }}
                className={inputCls}
              >
                {mainCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="add-subcat"
                className="block text-xs font-semibold text-[var(--color-ink)] mb-1.5"
              >
                الفئة الفرعية (الغرض)
              </label>
              <select
                id="add-subcat"
                value={subCategoryId}
                onChange={(e) => setSubCategoryId(e.target.value)}
                className={inputCls}
              >
                <option value="auto">تصنيف تلقائي ذكي حسب العنوان والمواصفات</option>
                {filteredSubCategories.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
              {filteredSubCategories.length === 0 && (
                <p className="mt-1.5 text-[11px] text-[var(--color-muted)]">
                  لا توجد فئات فرعية مخصصة لهذا التصنيف حالياً؛ سيُعتمد التصنيف التلقائي الذكي.
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="add-breed"
                className="block text-xs font-semibold text-[var(--color-ink)] mb-1.5"
              >
                السلالة
              </label>
              <select
                id="add-breed"
                value={breedId}
                onChange={(e) => setBreedId(e.target.value)}
                className={inputCls}
              >
                {(filteredBreeds.length > 0 ? filteredBreeds : breeds).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="add-region"
                className="block text-xs font-semibold text-[var(--color-ink)] mb-1.5"
              >
                المنطقة
              </label>
              <select
                id="add-region"
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
                className={inputCls}
              >
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="add-city"
                className="block text-xs font-semibold text-[var(--color-ink)] mb-1.5"
              >
                المدينة أو المحافظة
              </label>
              <input
                id="add-city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="مثال: الرياض، بريدة، حفر الباطن"
                required
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* Section 2: Livestock Specs & Pricing */}
        <div
          id="step-details"
          className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4 sm:p-6 space-y-6 scroll-mt-32 sm:scroll-mt-20"
        >
          <div className="flex items-center gap-3 pb-4 border-b border-[var(--color-border)]">
            <span className="w-8 h-8 rounded-xl bg-[var(--color-green)] text-white font-display text-sm font-extrabold tabular-nums flex items-center justify-center shrink-0">
              2
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
                2. تفاصيل الحلال والسعر
              </h2>
              <p className="text-xs text-[var(--color-muted)]">
                وضح المواصفات الفعلية والسعر للرأس الواحد مع حساب تلقائي لقيمة القطيع الإجمالية.
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="add-title"
              className="block text-xs font-semibold text-[var(--color-ink)] mb-1.5"
            >
              عنوان الإعلان
            </label>
            <input
              id="add-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: جذعان نعيمي بلدي تربية مراح محصنة"
              required
              className={inputCls}
            />
          </div>

          {/* Pricing + Quantity + Specs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <div>
              <label
                htmlFor="add-price"
                className="block text-xs font-semibold text-[var(--color-ink)] mb-1.5"
              >
                السعر للرأس (ر.س)
              </label>
              <input
                id="add-price"
                type="number"
                inputMode="numeric"
                min="100"
                value={priceAmount}
                onChange={(e) => setPriceAmount(e.target.value)}
                required
                className={`${inputCls} tabular-nums font-semibold`}
              />
            </div>

            <div>
              <label
                htmlFor="add-expected-price"
                className="block text-xs font-semibold text-[var(--color-ink)] mb-1.5"
              >
                السعر المتوقع (ر.س)
              </label>
              <input
                id="add-expected-price"
                type="number"
                inputMode="numeric"
                min="0"
                value={expectedPrice}
                onChange={(e) => setExpectedPrice(e.target.value)}
                placeholder="اختياري — مثال: 1700"
                aria-invalid={!expectedPriceValidation.ok}
                aria-describedby={!expectedPriceValidation.ok ? 'add-expected-price-error' : undefined}
                className={`${inputCls} tabular-nums ${
                  !expectedPriceValidation.ok ? 'border-red-500 focus:border-red-600' : ''
                }`}
              />
              {!expectedPriceValidation.ok && (
                <p
                  id="add-expected-price-error"
                  role="alert"
                  className="mt-1 text-[11px] font-medium text-red-700 dark:text-red-300 leading-snug"
                >
                  {expectedPriceValidation.error}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="add-age"
                className="block text-xs font-semibold text-[var(--color-ink)] mb-1.5"
              >
                العمر (أشهر)
              </label>
              <input
                id="add-age"
                type="number"
                inputMode="numeric"
                min="1"
                value={ageMonths}
                onChange={(e) => setAgeMonths(e.target.value)}
                required
                className={`${inputCls} tabular-nums`}
              />
            </div>

            <div>
              <label
                htmlFor="add-weight"
                className="block text-xs font-semibold text-[var(--color-ink)] mb-1.5"
              >
                الوزن (كجم)
              </label>
              <input
                id="add-weight"
                type="number"
                inputMode="numeric"
                min="5"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                required
                className={`${inputCls} tabular-nums`}
              />
            </div>

            <div className="col-span-2 lg:col-span-1">
              <label
                htmlFor="add-qty"
                className="block text-xs font-semibold text-[var(--color-ink)] mb-1.5"
              >
                العدد (رأس)
              </label>
              <input
                id="add-qty"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                aria-invalid={!herdSummary.isValidQuantity}
                className={`${inputCls} tabular-nums font-semibold`}
              />
            </div>
          </div>

          {/* Live Livestock Quantity & Total Herd Value Feedback */}
          <div
            aria-live="polite"
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/70 p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-[var(--color-green-ink)]">
                ملخص الكمية وإجمالي قيمة القطيع
              </p>
              <span className="text-xs font-semibold text-[var(--color-muted)] tabular-nums">
                {herdSummary.quantity} رأس × {formatPriceSar(herdSummary.unitPrice)} للرأس
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] px-3.5 py-3">
                <p className="text-[var(--color-muted)]">العدد المعلن</p>
                <p className="mt-1 font-display text-lg font-extrabold text-[var(--color-ink)] tabular-nums">
                  {herdSummary.quantity} رأس
                </p>
              </div>
              <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] px-3.5 py-3">
                <p className="text-[var(--color-muted)]">إجمالي قيمة القطيع المطلوبة</p>
                <p className="mt-1 font-display text-lg font-extrabold text-[var(--color-green-ink)] tabular-nums">
                  {formatPriceSar(herdSummary.totalAskingValue)}
                </p>
              </div>
              <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] px-3.5 py-3">
                <p className="text-[var(--color-muted)]">إجمالي السعر المتوقع</p>
                <p className="mt-1 font-display text-lg font-extrabold text-[var(--color-ink)] tabular-nums">
                  {herdSummary.totalExpectedValue !== null
                    ? formatPriceSar(herdSummary.totalExpectedValue)
                    : 'غير محدد'}
                </p>
              </div>
            </div>

            {!herdSummary.isValidQuantity && (
              <p role="alert" className="text-xs font-medium text-red-700 dark:text-red-300">
                يجب أن يكون عدد الرؤوس رقماً صحيحاً يساوي 1 أو أكثر لحساب إجمالي قيمة القطيع بدقة.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end pt-1">
            <div>
              <label
                htmlFor="add-sex"
                className="block text-xs font-semibold text-[var(--color-ink)] mb-1.5"
              >
                الجنس
              </label>
              <select
                id="add-sex"
                value={sex}
                onChange={(e) => setSex(e.target.value as LivestockSex)}
                className={inputCls}
              >
                <option value="ذكر">ذكر</option>
                <option value="أنثى">أنثى</option>
                <option value="قطيع مختلط">قطيع مختلط</option>
              </select>
            </div>

            <label className="min-h-[44px] h-11 px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/40 hover:bg-[var(--color-cream)] inline-flex items-center gap-2.5 text-xs sm:text-sm font-medium text-[var(--color-ink)] cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={isNegotiable}
                onChange={(e) => setIsNegotiable(e.target.checked)}
                className="w-4 h-4 accent-[#0B3A29]"
              />
              <span>السعر قابل للتفاوض</span>
            </label>

            <label className="min-h-[44px] h-11 px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/40 hover:bg-[var(--color-cream)] inline-flex items-center gap-2.5 text-xs sm:text-sm font-medium text-[var(--color-ink)] cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={allowPriceOffers}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setAllowPriceOffers(checked);
                  if (checked) setIsNegotiable(true);
                }}
                className="w-4 h-4 accent-[#0B3A29]"
              />
              <span>تفعيل تقديم عرض سعر (السوم)</span>
            </label>

            <label className="min-h-[44px] h-11 px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/40 hover:bg-[var(--color-cream)] inline-flex items-center gap-2.5 text-xs sm:text-sm font-medium text-[var(--color-ink)] cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={vaccinated}
                onChange={(e) => setVaccinated(e.target.checked)}
                className="w-4 h-4 accent-[#0B3A29]"
              />
              <span>محصّن بيطرياً</span>
            </label>
          </div>

          {allowPriceOffers && (
            <p className="text-xs text-[var(--color-muted)] bg-[var(--color-cream)] border border-[var(--color-border)] rounded-xl px-4 py-3 leading-relaxed">
              سيتمكن المشترون في صفحة الإعلان من إرسال عروض أسعار منظمة بالكمية والملاحظات ومقارنتها مع السعر المتوقع، ويمكنك قبولها أو رفضها من تفاصيل الإعلان أو لوحة حسابي.
            </p>
          )}

          <div>
            <label
              htmlFor="add-desc"
              className="block text-xs font-semibold text-[var(--color-ink)] mb-1.5"
            >
              الوصف الكامل والحالة الصحية
            </label>
            <textarea
              id="add-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اذكر نوع العلف، التحصينات، إمكانية التوصيل، وأي ملاحظات تهم المشتري..."
              required
              className="w-full p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/75 focus:outline-none focus:border-[var(--color-green-ink)] focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/50"
            />
          </div>
        </div>

        {/* Section 3: Device Image Upload + Reordering + Cover Selection + Optional Short Video */}
        <div
          id="step-media"
          className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4 sm:p-6 space-y-6 scroll-mt-32 sm:scroll-mt-20"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-xl bg-[var(--color-green)] text-white font-display text-sm font-extrabold tabular-nums flex items-center justify-center shrink-0">
                3
              </span>
              <div>
                <h2 className="font-display text-lg font-bold text-[var(--color-ink)]">
                  3. صور وفيديو الحلال
                </h2>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  ارفع صوراً حقيقية من جهازك (حتى {MAX_IMAGES} صور · 5 ميجابايت للصورة) مع إمكانية إرفاق فيديو قصير واحد.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-lg bg-[var(--color-cream)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-green-ink)] tabular-nums">
              الصور المرفقة: {selectedImages.length} / {MAX_IMAGES}
            </span>
          </div>

          {mediaError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300"
            >
              {mediaError}
            </div>
          )}

          {/* Multi-Image Upload Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setImageDragOver(true);
            }}
            onDragLeave={() => setImageDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setImageDragOver(false);
              if (e.dataTransfer.files?.length) {
                handleUploadImageFiles(e.dataTransfer.files);
              }
            }}
            className={`rounded-2xl border-2 border-dashed p-6 transition-colors text-center ${
              imageDragOver
                ? 'border-[var(--color-green-ink)] bg-[var(--color-cream)]'
                : 'border-[var(--color-border)] bg-[var(--color-cream)]/40 hover:bg-[var(--color-cream)]/70'
            }`}
          >
            <input
              ref={imageInputRef}
              id="add-images-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => {
                if (e.target.files?.length) {
                  handleUploadImageFiles(e.target.files);
                  e.target.value = '';
                }
              }}
            />
            <div className="flex flex-col items-center gap-2.5">
              <div className="w-12 h-12 rounded-2xl bg-[var(--color-green)]/10 text-[var(--color-green-ink)] flex items-center justify-center">
                {uploadingImagesCount > 0 ? (
                  <Loader2 size={22} className="animate-spin" aria-hidden="true" />
                ) : (
                  <ImagePlus size={22} aria-hidden="true" />
                )}
              </div>
              <p className="text-sm font-bold text-[var(--color-ink)]">
                {uploadingImagesCount > 0
                  ? `جاري رفع ${uploadingImagesCount} صورة...`
                  : 'اسحب صور الحلال وأفلتها هنا، أو اختر من جهازك'}
              </p>
              <p className="text-xs text-[var(--color-muted)]">
                الصيغ المدعومة: JPG، PNG، WebP · الحد الأقصى 5 ميجابايت لكل صورة
              </p>
              <button
                type="button"
                disabled={selectedImages.length >= MAX_IMAGES}
                onClick={() => imageInputRef.current?.click()}
                className="mt-1 min-h-[44px] px-5 py-2 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Upload size={14} aria-hidden="true" />
                <span>اختيار صور من الجهاز</span>
              </button>
            </div>
          </div>

          {/* Selected / Uploaded Images Preview + Reordering + Cover Selection */}
          {selectedImages.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[var(--color-ink)]">
                  ترتيب الصور (الصورة الأولى تظهر كغلاف للإعلان)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {selectedImages.map((img, idx) => {
                  const isCover = idx === 0;
                  return (
                    <div
                      key={img.key}
                      className={`rounded-xl overflow-hidden border bg-[var(--color-surface)] flex flex-col ${
                        isCover
                          ? 'border-[var(--color-green-ink)] ring-2 ring-[var(--color-gold)]/55'
                          : 'border-[var(--color-border)]'
                      }`}
                    >
                      <div className="relative aspect-[4/3] bg-[var(--color-cream)]">
                        <SafeImage
                          src={img.url}
                          alt={img.label || `صورة ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {isCover && (
                          <span className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-[var(--color-green)] text-white text-[11px] font-bold inline-flex items-center gap-1 shadow-sm">
                            <Star size={11} className="fill-[var(--color-gold)] text-[var(--color-gold)]" aria-hidden="true" />
                            <span>صورة الغلاف</span>
                          </span>
                        )}
                        <span className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/70 text-white text-[11px] font-bold tabular-nums">
                          {idx + 1}
                        </span>
                      </div>

                      <div className="p-3 space-y-2.5 flex-1 flex flex-col justify-between bg-[var(--color-cream)]/35">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-[var(--color-ink)] truncate">
                            {img.label}
                          </p>
                          {img.sizeBytes && (
                            <span className="text-[11px] text-[var(--color-muted)] tabular-nums shrink-0">
                              {formatFileSize(img.sizeBytes)}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-[var(--color-border)]/70">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleMoveImage(idx, -1)}
                              disabled={idx === 0}
                              title="تقديم الصورة"
                              aria-label={`تقديم الصورة ${idx + 1}`}
                              className="min-w-[44px] min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] text-[var(--color-ink)] flex items-center justify-center cursor-pointer disabled:opacity-40"
                            >
                              <ChevronRight size={16} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveImage(idx, 1)}
                              disabled={idx === selectedImages.length - 1}
                              title="تأخير الصورة"
                              aria-label={`تأخير الصورة ${idx + 1}`}
                              className="min-w-[44px] min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] text-[var(--color-ink)] flex items-center justify-center cursor-pointer disabled:opacity-40"
                            >
                              <ChevronLeft size={16} aria-hidden="true" />
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {!isCover && (
                              <button
                                type="button"
                                onClick={() => handleSetCover(idx)}
                                className="min-h-[44px] px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] text-xs font-semibold text-[var(--color-green-ink)] cursor-pointer"
                              >
                                تعيين كغلاف
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveImage(idx)}
                              aria-label={`حذف الصورة ${idx + 1}`}
                              title={`حذف الصورة ${idx + 1}`}
                              className="min-w-[44px] min-h-[44px] rounded-xl border border-red-200 dark:border-red-900/60 bg-[var(--color-surface)] hover:bg-red-50 dark:hover:bg-red-950/40 text-red-700 dark:text-red-300 flex items-center justify-center cursor-pointer"
                            >
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Optional Stock Gallery Picker */}
          <div className="pt-3 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setShowStockPicker((prev) => !prev)}
              aria-expanded={showStockPicker}
              className="min-h-[44px] inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-green-ink)] hover:underline cursor-pointer"
            >
              <span>اختيار صورة توضيحية من معرض المنصة (اختياري)</span>
              <ChevronDown
                size={14}
                className={`transition-transform ${showStockPicker ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>

            {showStockPicker && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3">
                {STOCK_GALLERY_OPTIONS.map((opt) => {
                  const selected = selectedImages.some((item) => !item.mediaId && item.url === opt.url);
                  return (
                    <button
                      key={opt.url}
                      type="button"
                      onClick={() => handleToggleStockImage(opt.url, opt.label)}
                      className={`rounded-xl overflow-hidden border-2 text-right transition-all cursor-pointer ${
                        selected
                          ? 'border-[var(--color-green-ink)] ring-2 ring-[var(--color-gold)]/50'
                          : 'border-[var(--color-border)] opacity-85 hover:opacity-100'
                      }`}
                    >
                      <div className="aspect-[4/3]">
                        <SafeImage src={opt.url} alt={opt.label} className="w-full h-full object-cover" />
                      </div>
                      <p className="px-2 py-1.5 text-xs font-medium text-[var(--color-ink)] bg-[var(--color-cream)] truncate">
                        {opt.label}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Optional Single Short Video Upload */}
          <div className="pt-5 border-t border-[var(--color-border)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-bold text-[var(--color-ink)] inline-flex items-center gap-2">
                  <Film size={16} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                  <span>فيديو قصير للحلال (اختياري)</span>
                </h3>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  مقطع فيديو واحد بحد أقصى {MAX_VIDEO_DURATION_SECONDS} ثانية و 25 ميجابايت لإبراز حركة الحلال وصحته (MP4، WebM، MOV).
                </p>
              </div>
            </div>

            <input
              ref={videoInputRef}
              id="add-video-input"
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="sr-only"
              onChange={(e) => {
                if (e.target.files?.length) {
                  handleUploadVideoFile(e.target.files);
                  e.target.value = '';
                }
              }}
            />

            {!uploadedVideo ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setVideoDragOver(true);
                }}
                onDragLeave={() => setVideoDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setVideoDragOver(false);
                  if (e.dataTransfer.files?.length) {
                    handleUploadVideoFile(e.dataTransfer.files);
                  }
                }}
                className={`rounded-2xl border border-dashed p-4 sm:p-5 transition-colors flex flex-col sm:flex-row items-center justify-between gap-3 ${
                  videoDragOver
                    ? 'border-[var(--color-green-ink)] bg-[var(--color-cream)]'
                    : 'border-[var(--color-border)] bg-[var(--color-cream)]/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-[var(--color-gold)]/20 text-[var(--color-ink)] flex items-center justify-center shrink-0">
                    {uploadingVideo ? (
                      <Loader2 size={18} className="animate-spin text-[var(--color-green-ink)]" aria-hidden="true" />
                    ) : (
                      <Video size={18} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs sm:text-sm font-semibold text-[var(--color-ink)]">
                      {uploadingVideo ? 'جاري رفع الفيديو والتحقق منه...' : 'إرفاق مقطع فيديو قصير (اختياري)'}
                    </p>
                    <p className="text-[11px] text-[var(--color-muted)]">
                      يدعم MP4 و WebM و MOV · حتى 25 ميجابايت
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={uploadingVideo}
                  onClick={() => videoInputRef.current?.click()}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--color-green-ink)] text-[var(--color-green-ink)] hover:bg-[var(--color-green)] hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <Upload size={14} aria-hidden="true" />
                  <span>{uploadingVideo ? 'جاري الرفع...' : 'اختيار فيديو'}</span>
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-cream)]/40 overflow-hidden">
                <div className="aspect-video max-h-72 w-full bg-black">
                  <video
                    src={uploadedVideo.url}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-[var(--color-surface)] border-t border-[var(--color-border)]">
                  <div className="text-xs min-w-0">
                    <p className="font-semibold text-[var(--color-ink)] truncate max-w-xs">
                      {uploadedVideo.originalName}
                    </p>
                    <p className="text-[11px] text-[var(--color-muted)] tabular-nums">
                      الحجم: {formatFileSize(uploadedVideo.sizeBytes)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={uploadingVideo}
                      onClick={() => videoInputRef.current?.click()}
                      className="min-h-[44px] px-3.5 py-1.5 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-cream)] text-xs font-semibold text-[var(--color-ink)] cursor-pointer"
                    >
                      استبدال الفيديو
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveVideo}
                      className="min-h-[44px] px-3.5 py-1.5 rounded-xl border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold text-red-700 dark:text-red-300 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      <span>إزالة الفيديو</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Commission Trust Pledge & Optional Featured Listing Request */}
        {!isAdmin && (requiresCommissionPledge || !editingListing?.isFeatured) && (
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4 sm:p-6 space-y-4">
            {requiresCommissionPledge && (
              <div className="rounded-xl border border-[var(--color-green-ink)]/30 bg-[var(--color-cream)]/60 p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck
                    size={18}
                    className="text-[var(--color-green-ink)] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="space-y-1">
                    <h3 className="font-display text-sm sm:text-base font-bold text-[var(--color-ink)]">
                      إقرار الأمانة والتزام العمولة ({commissionSettings?.commissionRatePercent ?? 1}%)
                    </h3>
                    <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                      {commissionEligibility?.isExempt
                        ? `${commissionEligibility.reasonLabel}. بعد انتهاء العرض التشجيعي، تطبق عمولة ${commissionSettings?.commissionRatePercent ?? 1}% فقط بعد إتمام البيع عبر المنصة.`
                        : `تُحسب عمولة الموقع بنسبة ${commissionSettings?.commissionRatePercent ?? 1}% من قيمة البيع الفعلية على البائع فقط بعد إتمام البيع عن طريق المنصة (مثلاً: 15 ر.س لكل 1,500 ر.س).`}
                    </p>
                  </div>
                </div>

                <label
                  htmlFor="add-commission-pledge"
                  className="flex items-start gap-2.5 cursor-pointer select-none pt-1"
                >
                  <input
                    id="add-commission-pledge"
                    type="checkbox"
                    checked={commissionPledgeAccepted}
                    onChange={(e) => {
                      setCommissionPledgeAccepted(e.target.checked);
                      if (error) setError('');
                    }}
                    className="mt-0.5 w-5 h-5 rounded border-[var(--color-border)] accent-[var(--color-green)] cursor-pointer shrink-0"
                  />
                  <span className="text-xs sm:text-sm font-semibold text-[var(--color-ink)] leading-relaxed">
                    أتعهد وأقر أمام الله بأن عمولة الموقع البالغة{' '}
                    <span className="text-[var(--color-green-ink)] font-bold">
                      {commissionSettings?.commissionRatePercent ?? 1}%
                    </span>{' '}
                    أمانة في ذمتي ألتزم بسدادها عند إتمام البيع عن طريق المنصة.
                  </span>
                </label>
              </div>
            )}

            {!editingListing?.isFeatured && (
              <label
                htmlFor="add-featured-request"
                className={`block rounded-xl border p-4 cursor-pointer transition-colors ${
                  featuredRequested
                    ? 'border-[var(--color-gold)] bg-[var(--color-gold-soft)]/35'
                    : 'border-[var(--color-border)] bg-[var(--color-cream)]/30 hover:bg-[var(--color-cream)]/55'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    id="add-featured-request"
                    type="checkbox"
                    checked={featuredRequested}
                    onChange={(e) => setFeaturedRequested(e.target.checked)}
                    className="mt-0.5 w-5 h-5 rounded border-[var(--color-border)] accent-[var(--color-green)] cursor-pointer shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-display text-sm font-bold text-[var(--color-ink)] inline-flex items-center gap-1.5">
                        <Sparkles size={15} className="text-[var(--color-gold)]" aria-hidden="true" />
                        <span>طلب تمييز وتثبيت الإعلان في الصفحة الرئيسية (اختياري)</span>
                      </span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-xs font-extrabold text-[var(--color-green-ink)] tabular-nums">
                        {formatPriceSar(commissionSettings?.featuredWeeklyPriceSar ?? 35)} / أسبوع
                      </span>
                    </div>
                    <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                      يُبرز إعلانك في مقدمة النتائج ويزيد فرص البيع السريع. يُنشأ سجل رسوم التمييز لتأكيد التحويل من لوحة حسابي.
                    </p>
                  </div>
                </div>
              </label>
            )}
          </div>
        )}

        {/* Action Footer Bar */}
        <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-[var(--color-muted)] tabular-nums space-y-0.5">
            <p className="font-semibold text-[var(--color-ink)]">
              إجمالي القطيع: {formatPriceSar(herdSummary.totalAskingValue)} ({herdSummary.quantity} رأس)
            </p>
            <p>
              الصور المرفقة: {selectedImages.length} / {MAX_IMAGES}
              {uploadedVideo ? ' · فيديو مرفق' : ''}
            </p>
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5">
            <button
              type="button"
              onClick={handleRequestCancel}
              disabled={submitting}
              className="min-h-[44px] px-5 py-2.5 rounded-xl border border-[var(--color-border)] text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-cream)] cursor-pointer disabled:opacity-50"
            >
              إلغاء
            </button>
            {(!isEditing || editingListing?.status === 'Draft') && !isAdmin && (
              <button
                type="button"
                disabled={submitting || isUploadingAny}
                onClick={() => submitListingForm('Draft')}
                className="min-h-[44px] px-5 py-2.5 rounded-xl border border-[var(--color-green-ink)] text-[var(--color-green-ink)] hover:bg-[var(--color-cream)] text-sm font-semibold cursor-pointer disabled:opacity-60"
              >
                حفظ كمسودة
              </button>
            )}
            <button
              type="submit"
              disabled={submitting || isUploadingAny}
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
            >
              {isUploadingAny
                ? 'جاري رفع الوسائط...'
                : submitting
                ? 'جاري الحفظ...'
                : isEditing
                ? editingListing?.status === 'Rejected' ||
                  editingListing?.status === 'Draft' ||
                  editingListing?.status === 'Expired'
                  ? 'حفظ وإعادة الإرسال للمراجعة'
                  : 'حفظ التعديلات'
                : isAdmin
                ? 'نشر الإعلان مباشرة'
                : 'إرسال للمراجعة والنشر'}
            </button>
          </div>
        </div>
      </form>

      <Modal
        open={leaveModalOpen}
        onClose={handleKeepEditing}
        title="تأكيد مغادرة النموذج"
        subtitle="توجد تغييرات أو وسائط غير محفوظة في نموذج الإعلان"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-ink)] leading-relaxed">
            {isEditing
              ? 'لديك تعديلات غير محفوظة على هذا الإعلان. عند المغادرة دون حفظ سيتم تجاهل التعديلات وإزالة أي ملفات مؤقتة رُفعت في هذه الجلسة فقط، مع بقاء صور وفيديو الإعلان المحفوظ كما هي.'
              : 'لديك بيانات أو وسائط غير محفوظة في مسودة الإعلان. عند المغادرة الآن سيتم تجاهلها وإزالة الملفات المؤقتة غير المحفوظة.'}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleKeepEditing}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] text-sm font-semibold text-[var(--color-ink)] cursor-pointer"
            >
              البقاء في النموذج
            </button>
            <button
              type="button"
              onClick={handleConfirmDiscard}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-sm font-semibold cursor-pointer"
            >
              تجاهل التغييرات والمغادرة
            </button>
          </div>
        </div>
      </Modal>
      </div>
    </section>
  );
}

