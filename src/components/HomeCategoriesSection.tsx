import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Breed, Category, Listing } from '../types/marketplace';
import type { DirectoryFilters } from '../lib/listing-search';
import { useI18n, type Language } from '../lib/i18n';
import {
  trBreedName,
  trBreedOrigin,
  trCategoryDesc,
  trCategoryName,
} from '../lib/bilingual';

export interface HomeCategoriesSectionProps {
  categories: Category[];
  breeds?: Breed[];
  publishedListings: Listing[];
  onFilterListings: (patch: Partial<DirectoryFilters>) => void;
  onBrowseAll: () => void;
}

export type MedallionEmblemKind =
  | 'sheep'
  | 'goat'
  | 'camel'
  | 'cattle'
  | 'slaughter'
  | 'breeding'
  | 'show'
  | 'rams'
  | 'naimi'
  | 'najdi'
  | 'harri'
  | 'ardhi'
  | 'sawakni';

export type CategoryShowcaseTab = 'featured' | 'breeds' | 'purpose';

export function formatArabicListingCount(count: number, lang: Language = 'ar'): string {
  if (lang === 'en') {
    if (count <= 0) return 'Browse';
    if (count === 1) return '1 listing';
    return `${count.toLocaleString('en-US')} listings`;
  }
  if (count <= 0) return 'تصفح القسم';
  if (count === 1) return 'إعلان واحد';
  if (count === 2) return 'إعلانان';
  if (count >= 3 && count <= 10) return `${count.toLocaleString('en-US')} إعلانات`;
  return `${count.toLocaleString('en-US')} إعلان`;
}

export function MedallionLivestockIcon({
  kind,
  className = 'w-12 h-12 sm:w-14 sm:h-14',
}: {
  kind: MedallionEmblemKind;
  className?: string;
}) {
  const svgProps = {
    viewBox: '0 0 64 64',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true as const,
  };

  if (kind === 'camel') {
    return (
      <svg {...svgProps}>
        <path
          d="M12 48V34c0-5 4-9 8-9 3 0 4-7 9-7s6 7 9 7c4 0 8 2 10-4l2-8c1-3 5-3 6 0l1 4-5 2c-1 5-1 11-5 15v14H12z"
          fill="currentColor"
          fillOpacity="0.09"
          stroke="none"
        />
        <path d="M12 49V34c0-5 4-9 8-9 3 0 4-7 9-7s6 7 9 7c4 0 8 2 10-4l2-8c1-3 5-3 6 0l1 4-5 2c-1 5-1 11-5 15v15" />
        <path d="M18 49v-9m14 9v-9m10 9v-9" />
        <path d="M12 36l-3 5" />
      </svg>
    );
  }

  if (kind === 'cattle') {
    return (
      <svg {...svgProps}>
        <path
          d="M13 48V31c0-5 4-9 10-9h18l8-4 4 6-3 7-7 1-2 16H13z"
          fill="currentColor"
          fillOpacity="0.09"
          stroke="none"
        />
        <path d="M13 49V31c0-5 4-9 10-9h18l8-4 4 6-3 7-7 1-2 17" />
        <path d="M46 18c-1-4-3-6-6-6M52 17c1-3 3-5 5-5" />
        <path d="M20 49v-10m16 10v-10" />
        <path d="M13 30l-3 7" />
      </svg>
    );
  }

  // Naimi Sheep (النعيمي): thick woolly body, signature curved fat-tail, camel-gold shaded head & horns
  if (kind === 'naimi') {
    return (
      <svg {...svgProps}>
        <path
          d="M16 39c-3-1-4.5-4.5-3-8.2-.2-3.8 2.8-7 6.8-7.4 2.5-3.2 8-3.7 11.4-1.4 3.4-2.2 8.8-1.4 11.2 1.8l1.2 15.8-27.6-.6z"
          fill="currentColor"
          fillOpacity="0.08"
          stroke="none"
        />
        <path
          d="M42.4 23.8c2.6-2.8 7-3.2 9.8-.5 2.4 1.6 3.6 4.2 2.4 6.4-1.3 1.8-4.5 1.8-7.2.4l-2.8 4.4-2.2-10.7z"
          fill="var(--color-gold)"
          fillOpacity="0.26"
          stroke="none"
        />
        <path d="M16 39c-3-1-4.5-4.5-3-8.2-.2-3.8 2.8-7 6.8-7.4 2.5-3.2 8-3.7 11.4-1.4 3.4-2.2 8.8-1.4 11.2 1.8 2.6-2.8 7-3.2 9.8-.5 2.4 1.6 3.6 4.2 2.4 6.4-1.3 1.8-4.5 1.8-7.2.4-.9 3.7-2.6 7.5-6 8.9-3.6 1-8.2 1-11.6.5-3.6.7-8 .5-11.2-.5" />
        {/* Signature curved fat-tail (لية) */}
        <path
          d="M14.5 29c-3.5 1.2-4.8 5.2-2.6 8.4 1.5 2.2 4 2.2 4.6.4"
          stroke="var(--color-gold)"
          strokeWidth="2"
        />
        <path d="M44.5 21.5c1.8-2.8 5.4-3.2 7.4-.9" />
        <path d="M45.2 26c-2.2.7-3.5 3-3 5.5 1.8 0 3.2-1.5 3.6-3.5" />
        <path d="M19.5 39.5L18 51m6.5-11.5L24 51m13-11.5V51m4.5-11.5L43.5 51" />
        <circle cx="50" cy="25.6" r="0.85" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  // Najdi Sheep (النجدي): tall slender aristocratic stance, sleek dark-tinted coat & white face blaze, curved Roman nose
  if (kind === 'najdi') {
    return (
      <svg {...svgProps}>
        <path
          d="M13.5 35.5c-1.8-3.2-1.2-7.8 1.8-10.2 3-2.5 8-3.2 13-2.8h12.2l1.8 12.2-28.8.8z"
          fill="currentColor"
          fillOpacity="0.2"
          stroke="none"
        />
        <path d="M14 35.5c-2.2-3.2-1.6-7.8 1.5-10.2 3-2.5 8.2-3.2 13.5-2.8h11.5c2.2-2.5 5.6-3.8 8.8-2.8 3.2 1 5.4 4.2 5.6 7.5.1 1.8-1.4 3.2-3.6 3-2.4-.2-4.5-1.5-6-3.2-.6 4.5-2.4 8-5.8 9.2H18.5" />
        {/* White blaze accent along Roman muzzle & long Najdi hanging ear */}
        <path
          d="M46.5 19.8c2.6.8 4.6 3 5.4 5.8"
          stroke="var(--color-gold)"
          strokeWidth="1.9"
        />
        <path d="M44.5 22.5c-2.4 1.8-3.2 5.4-2.2 8.4" />
        <path d="M14 27.5l-2.2 9.5" />
        {/* Long slender Najdi legs */}
        <path d="M18.5 36.2L16.5 52.5m6.5-16.3L22.5 52.5m13.5-16.3L35.5 52.5m4.5-16.3L42.5 52.5" />
        <circle cx="49.5" cy="23.4" r="0.85" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  // Harri Sheep (الحري): compact pure white Hijazi wool silhouette, hornless (أجم) rounded brow, alert ears
  if (kind === 'harri') {
    return (
      <svg {...svgProps}>
        <path
          d="M16 40c-3.5-.8-4.5-4.8-2.8-8.3-.2-3.8 3-7 7-7.2 2.8-3.2 8.2-3.5 11.4-1.2 3.2-2 8.2-1.2 10.6 2l-.8 15.2H18l-2-.5z"
          fill="currentColor"
          fillOpacity="0.06"
          stroke="none"
        />
        <path d="M16 40c-3.5-.8-4.5-4.8-2.8-8.3-.2-3.8 3-7 7-7.2 2.8-3.2 8.2-3.5 11.4-1.2 3.2-2 8.2-1.2 10.6 2 2.4-2.4 6.5-2.6 9.2-.2 2.2 1.5 3.2 3.8 2 5.8-1.4 1.6-4.4 1.5-6.8.1-.8 4-2.5 7.8-5.8 9H20" />
        {/* Hornless smooth brow + alert Hijazi ear */}
        <path d="M43.5 26.2l-3.8-3.2 4.8.8" stroke="var(--color-gold)" strokeWidth="1.85" />
        <path d="M15.5 33l-2.5 3" />
        <path d="M19.5 40L18 50.5M25.5 40V50.5M36.5 40V50.5M40.5 40L42 50.5" />
        <circle cx="49" cy="26.8" r="0.85" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  // Sawakni Sheep (السواكني): smooth short-haired athletic body, long neck & long tail
  if (kind === 'sawakni') {
    return (
      <svg {...svgProps}>
        <path
          d="M14.5 37.5c-2-3-1.2-7.5 1.8-9.5 3-2 8.5-2.5 14-2.2h10.5l4-5c1.8-1.8 4.8-2 6.8-.5 1.8 1.4 2.4 3.8 1.2 5.5-1.4 1.6-4.2 1.4-6.4 0-.8 4.6-2.5 9.2-6 10.7H19l-4.5 1z"
          fill="var(--color-gold)"
          fillOpacity="0.14"
          stroke="none"
        />
        <path d="M14.5 37.5c-2-3-1.2-7.5 1.8-9.5 3-2 8.5-2.5 14-2.2h10.5c1.8-2.8 4.8-5 8.2-4.6 2.8.4 4.8 2.8 4.8 5.5 0 1.8-1.6 3-3.8 2.7-2.2-.3-4-1.5-5.4-3-.8 4.8-2.4 9.5-5.8 11H19" />
        <path d="M43.8 23.8c-2 1.2-3 3.4-2.4 5.8" />
        <path d="M14.5 30.2L12 41.5" stroke="var(--color-gold)" strokeWidth="1.9" />
        <path d="M18.8 37.4L17 51.5m6.5-14.1L23 51.5m13-14.1V51.5m4.2-14.1L42.5 51.5" />
        <circle cx="49.5" cy="24.2" r="0.85" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  // Proud Saudi Ardhi goat (الماعز / العارضي) with sweeping horns, ultra-long drooping ear, and beard tuft
  if (kind === 'goat' || kind === 'ardhi') {
    return (
      <svg {...svgProps}>
        <path
          d="M15 40V34c0-5.5 4.2-9.5 10-9.5h15.5l6.5-8.5c1.2-1.6 3.6-1.2 4 1l-1.5 5.5 5.2 2.4-2.4 5.1-5.8-.7-2.8 7.7V40H15z"
          fill="currentColor"
          fillOpacity="0.12"
          stroke="none"
        />
        <path d="M15 48V34c0-5.5 4.2-9.5 10-9.5h15.5l6.5-8.5c1.2-1.6 3.6-1.2 4 1l-1.5 5.5 5.2 2.4-2.4 5.1-5.8-.7-2.8 7.7V48" />
        <path
          d="M44.5 17.5c-2.5-4.8-6.8-7.2-11.5-6.2M48 16.5c.3-3.6 2-6.5 4.8-7.8"
          stroke={kind === 'ardhi' ? 'var(--color-gold)' : 'currentColor'}
        />
        <path d="M45 25c-2 3.8-2.4 8.2-1 11.4" />
        <path d="M49.5 30.8l-1.6 4.2" />
        <path d="M20.5 48v-9.5M26 48v-7.5M37 48v-9.5M42.5 48v-8" />
        <path d="M15 33.5l-3.2-2.2" />
        <circle cx="49" cy="24.5" r="0.85" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  // Slaughter / prime lamb (ذبائح) — sleek young lamb silhouette with Saudi gold quality seal
  if (kind === 'slaughter') {
    return (
      <svg {...svgProps}>
        <path
          d="M16 41c-3-1-4-5-2-8.5 2-4 6.5-5.5 11.5-5.3 4-1.2 9.5-1 13.5 1.3 3-3 7.5-4 11-2 2.5 1.5 3.8 4 2.5 5.7-1.5 1.6-4.5 1.3-7-.2-.5 4.5-2 8-5.5 9.2H20z"
          fill="currentColor"
          fillOpacity="0.09"
          stroke="none"
        />
        <path d="M16 41c-3-1-4-5-2-8.5 2-4 6.5-5.5 11.5-5.3 4-1.2 9.5-1 13.5 1.3 3-3 7.5-4 11-2 2.5 1.5 3.8 4 2.5 5.7-1.5 1.6-4.5 1.3-7-.2-.5 4.5-2 8-5.5 9.2H20" />
        <path d="M43.5 26l-3-4 5 2.5" />
        <path d="M15 33.5l-2.5 3.5" />
        <path d="M19.5 41.2L18 51m6.5-9.8V51M36 41.2V51m4-9.8L42 51" />
        <circle cx="48.8" cy="28.3" r="0.85" fill="currentColor" stroke="none" />
        <path
          d="M23 11.5l3.6 3.6L23 18.7l-3.6-3.6L23 11.5z"
          fill="var(--color-gold)"
          fillOpacity="0.24"
          stroke="var(--color-gold)"
          strokeWidth="1.75"
        />
      </svg>
    );
  }

  // Breeding & herd production (مواشي للتربية) — mother ewe facing her young lamb
  if (kind === 'breeding') {
    return (
      <svg {...svgProps}>
        <path
          d="M12 38c-2.5-1-3-5-1-8.5 1-4 5-6 9.5-5.5 3-3 8-2.5 11 .5 2.5-2.5 6.5-2.5 9 0 2 1.5 2.5 3.7 1.3 5.3-1.8 1.4-4.3 1-6.3-.3-.5 4.5-2 8-5 9H15z"
          fill="currentColor"
          fillOpacity="0.09"
          stroke="none"
        />
        <path
          d="M43 37c2.5-.5 7 0 9.5 2.2 2 1.8 2 4.8 0 6H43c-1-1.4-1.2-3.2-.5-4.7L43 37z"
          fill="currentColor"
          fillOpacity="0.09"
          stroke="none"
        />
        <path d="M12 38c-2.5-1-3-5-1-8.5 1-4 5-6 9.5-5.5 3-3 8-2.5 11 .5 2.5-2.5 6.5-2.5 9 0 2 1.5 2.5 3.7 1.3 5.3-1.8 1.4-4.3 1-6.3-.3-.5 4.5-2 8-5 9H15" />
        <path d="M35 25.5c-2 1-3 3.3-2 5" />
        <path d="M15.5 38.5L14.5 49m5.5-10.5V49m7.5-10.5V49m3.5-10.5L32 49" />
        <path d="M43 37c-2.5-1.5-5.5-.5-6.2 1.8-.3 1.4 1.2 2.7 3.2 2.4l2.5-.7" />
        <path d="M42 37.5l2.5-2" />
        <path d="M43 37c2.5-.5 7 0 9.5 2.2 2 1.8 2 4.8 0 6H43c-1-1.4-1.2-3.2-.5-4.7" />
        <path d="M43.5 45.2L43 51.5m3.5-6.3V51.5m3.5-6.3V51.5m2-6.3L53 51.5" />
      </svg>
    );
  }

  // Show & purebred livestock (مواشي للعرض) — prized showcase sheep atop exhibition dais with gold laurel arc
  if (kind === 'show') {
    return (
      <svg {...svgProps}>
        <path
          d="M17 37c-3-1-3.5-5-1.5-8.5 1.5-4 6-6 10.5-5.5 3-2.5 8.5-2.5 12 .2 2.5-2.7 7-3.2 10.2-.7 2.6 1.7 3.8 4.3 2.6 6.3-1.6 1.7-4.6 1.4-6.8 0-.5 4.2-2.2 8-5.5 9H20.5z"
          fill="currentColor"
          fillOpacity="0.09"
          stroke="none"
        />
        <path d="M17 37c-3-1-3.5-5-1.5-8.5 1.5-4 6-6 10.5-5.5 3-2.5 8.5-2.5 12 .2 2.5-2.7 7-3.2 10.2-.7 2.6 1.7 3.8 4.3 2.6 6.3-1.6 1.7-4.6 1.4-6.8 0-.5 4.2-2.2 8-5.5 9H20.5" />
        <path d="M44 22.8c2.5-3.3 6.5-2.8 7.5 0" />
        <path d="M43.2 24.2c-2.2.8-3.2 2.8-2.7 4.8" />
        <path d="M20.5 37.8L19.5 46.5m5.5-8.7V46.5m9.5-8.7V46.5m4-8.7L40 46.5" />
        <circle cx="47.8" cy="24.8" r="0.85" fill="currentColor" stroke="none" />
        <path d="M15 49.5h34" stroke="var(--color-gold)" strokeWidth="1.9" />
        <path d="M22 54c4 2.2 16 2.2 20 0" stroke="var(--color-gold)" strokeWidth="1.75" />
      </svg>
    );
  }

  // Champion breeding ram (فحول الإنتاج) — bold sculpted gold horn & muscular proud stance
  if (kind === 'rams') {
    return (
      <svg {...svgProps}>
        <path
          d="M14 39c-2.5-2-2.5-6.5 0-10 2-3.5 6.5-5.5 11.5-5.5H38c2.5-2.5 6.5-4 10.5-3 3.5 1 6 4 6.5 7 .2 2-1.5 3.5-4 3.3-2.5-.3-4.5-1.6-6-3.3 1.5 1.5 1.5 7-5 12H19L14 39z"
          fill="currentColor"
          fillOpacity="0.09"
          stroke="none"
        />
        <path d="M14 39c-2.5-2-2.5-6.5 0-10 2-3.5 6.5-5.5 11.5-5.5H38c2.5-2.5 6.5-4 10.5-3 3.5 1 6 4 6.5 7 .2 2-1.5 3.5-4 3.3-2.5-.3-4.5-1.6-6-3.3" />
        <path
          d="M44.5 20.5c2-5 8-5.5 10.5-1.7 2 3.2 0 8-4 8.4-2.5.2-4-1.6-3-3.4"
          stroke="var(--color-gold)"
          strokeWidth="2.15"
        />
        <path d="M46.5 29c0 5.5-2.5 10-6.5 11.5H19" />
        <path d="M14 31l-2.5 3.5" />
        <path d="M18.5 40.5L16.5 51.5m7.5-11V51.5m12-11L35.5 51.5m5-11L43 51.5" />
        <circle cx="50.5" cy="24.2" r="0.85" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  // Default Sheep / أغنام — standing Saudi sheep with layered wool fill, clear head & ear, natural legs
  return (
    <svg {...svgProps}>
      <path
        d="M15 39c-3.5-.5-4.5-4.5-3-8-.5-3.5 2.5-7 6.5-7.5 2.5-3.5 8-4 11.5-1.5 3.5-2.5 9-1.5 11.5 2 2-2.5 7-3 10 0 2.5 1.5 3.7 4 2.5 6.2-1.2 1.8-4.5 2-7 .6-1 3.7-2.5 7.7-6 9.2-3.5 1-8 1-11.5.5-3.5.7-8 .5-11.5-.5L15 39z"
        fill="currentColor"
        fillOpacity="0.09"
        stroke="none"
      />
      <path d="M15 39c-3.5-.5-4.5-4.5-3-8-.5-3.5 2.5-7 6.5-7.5 2.5-3.5 8-4 11.5-1.5 3.5-2.5 9-1.5 11.5 2 2-2.5 7-3 10 0 2.5 1.5 3.7 4 2.5 6.2-1.2 1.8-4.5 2-7 .6-1 3.7-2.5 7.7-6 9.2-3.5 1-8 1-11.5.5-3.5.7-8 .5-11.5-.5" />
      <path d="M46 25.5c-2.5.5-4 3-3.5 6 2 0 3.5-1.7 4-4" />
      <path d="M15 32c-2.5 1.5-2.5 4.5-.5 6" />
      <path d="M18.5 40L17 51m6.5-10.5L23 51m13.5-10.5V51M41 40l2 11" />
      <circle cx="49.5" cy="25.8" r="0.85" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function getEmblemKindForCategory(category: Category): MedallionEmblemKind {
  const id = category.id;
  const name = category.name.trim();
  if (id === 'cat_breeding' || category.slug === 'breeding-rams' || name.includes('فحول')) {
    return 'rams';
  }
  if (id === 'sub_slaughter' || name.includes('ذبائح')) return 'slaughter';
  if (id === 'sub_breeding' || name.includes('تربية')) return 'breeding';
  if (id === 'sub_show' || name.includes('عرض')) return 'show';
  if (name.includes('إبل') || name.includes('ابل') || name.includes('جمل')) return 'camel';
  if (name.includes('ماعز') || name.includes('تيس') || name.includes('عارضي')) return 'goat';
  if (name.includes('بقر') || name.includes('أبقار') || name.includes('عجل')) return 'cattle';
  return 'sheep';
}

export function getEmblemKindForBreed(breed: Breed): MedallionEmblemKind {
  const slug = breed.slug.toLowerCase();
  const name = breed.name.trim();
  if (breed.id === 'brd_naimi' || slug === 'naimi' || name.includes('نعيمي')) return 'naimi';
  if (breed.id === 'brd_najdi' || slug === 'najdi' || name.includes('نجدي')) return 'najdi';
  if (breed.id === 'brd_harri' || slug === 'harri' || name.includes('حري')) return 'harri';
  if (breed.id === 'brd_ardhi' || slug === 'ardhi' || name.includes('عارضي')) return 'ardhi';
  if (breed.id === 'brd_sawakni' || slug === 'sawakni' || name.includes('سواكني')) return 'sawakni';
  return 'sheep';
}

function getMainCategorySubtitle(
  category: Category,
  childNames: string[],
  lang: Language
): string {
  const isEn = lang === 'en';
  if (category.description?.trim()) return trCategoryDesc(category.description.trim(), lang);
  const name = category.name.trim();
  if (name.includes('فحول') || category.id === 'cat_breeding') {
    return isEn ? 'Pedigree rams & breeding sires' : 'فحول صنف وسلالات للإنتاج';
  }
  if (name.includes('أغنام') || name.includes('ضأن')) {
    return childNames.length > 0
      ? isEn
        ? `Naimi · Najdi · Harri · ${childNames[0]}`
        : `نعيمي · نجدي · حري · ${childNames[0]}`
      : isEn
      ? 'Naimi · Najdi · Harri · Sawakni'
      : 'نعيمي · نجدي · حري · سواكني';
  }
  if (name.includes('ماعز')) {
    return isEn ? 'Ardhi · Shami · Productive herds' : 'عارضي · شامي · سلالات منتجة';
  }
  if (childNames.length > 0) {
    return childNames.join(' · ');
  }
  return isEn ? 'Updated listings from breeders' : 'عروض محدثة من المربين';
}

function getBreedShortSubtitle(breed: Breed, lang: Language): string {
  const isEn = lang === 'en';
  if (breed.origin?.trim()) return trBreedOrigin(breed.origin.trim(), lang);
  const name = breed.name.trim();
  if (name.includes('نعيمي')) return isEn ? 'Najd & North · Top Demand' : 'نجد والشمال · الأكثر طلباً';
  if (name.includes('نجدي')) return isEn ? 'Central Saudi Heritage' : 'أصالة وسط المملكة';
  if (name.includes('حري')) return isEn ? 'Hijaz & Western Coast' : 'الحجاز والساحل الغربي';
  if (name.includes('عارضي')) return isEn ? 'Authentic Saudi Goat' : 'الماعز السعودي الأصيل';
  if (name.includes('سواكني')) return isEn ? 'Locally Raised for Feasts' : 'مربى محلياً للولائم';
  return isEn ? 'Purebred Line' : 'سلالة أصيلة';
}

export interface CategoryMedallionItem {
  id: string;
  name: string;
  subtitle: string;
  count: number;
  kind: MedallionEmblemKind;
  filterPatch: Partial<DirectoryFilters>;
}

export function HomeCategoriesSection({
  categories,
  breeds = [],
  publishedListings,
  onFilterListings,
  onBrowseAll,
}: HomeCategoriesSectionProps) {
  const { lang, isEn } = useI18n();
  const [activeTab, setActiveTab] = useState<CategoryShowcaseTab>('featured');
  const DirArrow = isEn ? ArrowRight : ArrowLeft;

  const mainCategories = useMemo(
    () => categories.filter((c) => c.parentId === null),
    [categories]
  );

  const subCategories = useMemo(
    () => categories.filter((c) => c.parentId !== null),
    [categories]
  );

  const countByMainCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const listing of publishedListings) {
      counts.set(listing.categoryId, (counts.get(listing.categoryId) || 0) + 1);
    }
    return counts;
  }, [publishedListings]);

  const countBySubCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const listing of publishedListings) {
      if (listing.subCategoryId) {
        counts.set(listing.subCategoryId, (counts.get(listing.subCategoryId) || 0) + 1);
      }
    }
    return counts;
  }, [publishedListings]);

  const countByBreed = useMemo(() => {
    const counts = new Map<string, number>();
    for (const listing of publishedListings) {
      if (listing.breedId) {
        counts.set(listing.breedId, (counts.get(listing.breedId) || 0) + 1);
      }
    }
    return counts;
  }, [publishedListings]);

  const featuredMedallions = useMemo<CategoryMedallionItem[]>(() => {
    const animalMain = mainCategories.filter(
      (c) => c.id !== 'cat_breeding' && c.slug !== 'breeding-rams'
    );
    const ramsMain = mainCategories.filter(
      (c) => c.id === 'cat_breeding' || c.slug === 'breeding-rams'
    );

    const items: CategoryMedallionItem[] = [];

    for (const cat of animalMain) {
      const childNames = subCategories
        .filter((sub) => sub.parentId === cat.id)
        .map((sub) => trCategoryName(sub.name, lang));
      items.push({
        id: cat.id,
        name: trCategoryName(cat.name, lang),
        subtitle: getMainCategorySubtitle(cat, childNames, lang),
        count: countByMainCategory.get(cat.id) || 0,
        kind: getEmblemKindForCategory(cat),
        filterPatch: { categoryId: cat.id },
      });
    }

    if (breeds.length > 0) {
      // Prioritize signature Saudi sheep breeds (النعيمي، النجدي، الحري) right alongside الأغنام والماعز وفحول الإنتاج
      for (const breed of breeds.slice(0, 3)) {
        items.push({
          id: `featured_${breed.id}`,
          name: trBreedName(breed.name, lang),
          subtitle: getBreedShortSubtitle(breed, lang),
          count: countByBreed.get(breed.id) || 0,
          kind: getEmblemKindForBreed(breed),
          filterPatch: { breedId: breed.id },
        });
      }
    } else {
      for (const sub of subCategories) {
        items.push({
          id: sub.id,
          name: trCategoryName(sub.name, lang),
          subtitle:
            sub.id === 'sub_slaughter'
              ? isEn
                ? 'Ready for slaughter & feasts'
                : 'جاهزة للذبح والولائم'
              : sub.id === 'sub_breeding'
              ? isEn
                ? 'Pregnant & nursing breeding stock'
                : 'دفيع ومتابيع وقطيع إنتاج'
              : sub.id === 'sub_show'
              ? isEn
                ? 'Pedigree show livestock'
                : 'سلالات فاخرة للعرض'
              : trCategoryDesc(sub.description, lang) ||
                (isEn ? 'Quick livestock filter' : 'تصفية سريعة للإعلانات'),
          count: countBySubCategory.get(sub.id) || 0,
          kind: getEmblemKindForCategory(sub),
          filterPatch: {
            categoryId: 'all',
            subCategoryId: sub.id,
          },
        });
      }
    }

    for (const cat of ramsMain) {
      items.push({
        id: cat.id,
        name: trCategoryName(cat.name, lang),
        subtitle:
          trCategoryDesc(cat.description, lang) ||
          (isEn ? 'Pedigree breeding rams & sires' : 'فحول منتجة وسلالات أصيلة'),
        count: countByMainCategory.get(cat.id) || 0,
        kind: getEmblemKindForCategory(cat),
        filterPatch: { categoryId: cat.id },
      });
    }

    return items;
  }, [
    mainCategories,
    subCategories,
    breeds,
    countByMainCategory,
    countBySubCategory,
    countByBreed,
    lang,
    isEn,
  ]);

  const breedMedallions = useMemo<CategoryMedallionItem[]>(() => {
    return breeds.map((breed) => ({
      id: breed.id,
      name: trBreedName(breed.name, lang),
      subtitle: getBreedShortSubtitle(breed, lang),
      count: countByBreed.get(breed.id) || 0,
      kind: getEmblemKindForBreed(breed),
      filterPatch: { breedId: breed.id },
    }));
  }, [breeds, countByBreed, lang]);

  const purposeMedallions = useMemo<CategoryMedallionItem[]>(() => {
    const ramsMain = mainCategories.filter(
      (c) => c.id === 'cat_breeding' || c.slug === 'breeding-rams'
    );
    const items: CategoryMedallionItem[] = [];

    for (const sub of subCategories) {
      items.push({
        id: sub.id,
        name: trCategoryName(sub.name, lang),
        subtitle:
          sub.id === 'sub_slaughter'
            ? isEn
              ? 'Ready for slaughter & feasts'
              : 'جاهزة للذبح والولائم'
            : sub.id === 'sub_breeding'
            ? isEn
              ? 'Pregnant & nursing breeding stock'
              : 'دفيع ومتابيع وقطيع إنتاج'
            : sub.id === 'sub_show'
            ? isEn
              ? 'Pedigree show livestock'
              : 'سلالات فاخرة للعرض'
            : trCategoryDesc(sub.description, lang) ||
              (isEn ? 'Quick livestock filter' : 'تصفية سريعة للإعلانات'),
        count: countBySubCategory.get(sub.id) || 0,
        kind: getEmblemKindForCategory(sub),
        filterPatch: {
          categoryId: 'all',
          subCategoryId: sub.id,
        },
      });
    }

    for (const cat of ramsMain) {
      items.push({
        id: `purpose_${cat.id}`,
        name: trCategoryName(cat.name, lang),
        subtitle:
          trCategoryDesc(cat.description, lang) ||
          (isEn ? 'Pedigree breeding rams & sires' : 'فحول منتجة وسلالات أصيلة'),
        count: countByMainCategory.get(cat.id) || 0,
        kind: getEmblemKindForCategory(cat),
        filterPatch: { categoryId: cat.id },
      });
    }

    return items;
  }, [mainCategories, subCategories, countByMainCategory, countBySubCategory, lang, isEn]);

  const visibleMedallions = useMemo(() => {
    if (activeTab === 'breeds' && breedMedallions.length > 0) return breedMedallions;
    if (activeTab === 'purpose' && purposeMedallions.length > 0) return purposeMedallions;
    return featuredMedallions;
  }, [activeTab, breedMedallions, purposeMedallions, featuredMedallions]);

  const defaultSpotlightId = visibleMedallions[0]?.id ?? null;
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const activeSpotlightId = hoveredId ?? defaultSpotlightId;

  if (featuredMedallions.length === 0 && breedMedallions.length === 0) {
    return null;
  }

  const availableTabs: Array<{ id: CategoryShowcaseTab; label: string }> = [
    { id: 'featured', label: isEn ? 'Types & Breeds' : 'الأنواع والسلالات' },
    ...(breedMedallions.length > 0
      ? [{ id: 'breeds' as const, label: isEn ? 'Pure Breeds' : 'السلالات الأصيلة' }]
      : []),
    ...(purposeMedallions.length > 0
      ? [{ id: 'purpose' as const, label: isEn ? 'By Purpose' : 'حسب الغرض' }]
      : []),
  ];

  return (
    <section
      aria-labelledby="home-categories-heading"
      className="bg-[var(--color-canvas)] border-b border-[var(--color-border)] pt-5 pb-6 sm:pt-6 sm:pb-7 lg:pt-7 lg:pb-8 transition-colors"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Centered Editorial Header with Saudi Gold Flanking Hairlines */}
        <div className="text-center max-w-2xl mx-auto">
          <div className="flex items-center justify-center gap-3.5 max-w-xs sm:max-w-sm mx-auto mb-2.5">
            <span
              aria-hidden="true"
              className="flex-1 h-px bg-gradient-to-l from-[var(--color-gold)]/70 to-transparent"
            />
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-green-ink)] shadow-2xs">
              <MedallionLivestockIcon kind="sheep" className="w-5 h-5" />
            </span>
            <span
              aria-hidden="true"
              className="flex-1 h-px bg-gradient-to-r from-[var(--color-gold)]/70 to-transparent"
            />
          </div>

          <h2
            id="home-categories-heading"
            className="font-display text-2xl sm:text-3xl lg:text-[2rem] font-extrabold text-[var(--color-ink)] text-balance tracking-tight"
          >
            {isEn ? 'Browse Marketplace by Category & Purpose' : 'تصفح السوق حسب التصنيف والغرض'}
          </h2>
          <p className="mt-1.5 text-xs sm:text-sm lg:text-[15px] text-[var(--color-muted)] leading-relaxed">
            {isEn
              ? 'Select livestock type, pure breed, or buying purpose to jump straight to matching listings'
              : 'اختر نوع الماشية أو السلالة أو الغرض من الشراء للوصول مباشرة إلى الإعلانات المناسبة'}
          </p>

          {/* Interactive Filter Mode Tabs */}
          {availableTabs.length > 1 && (
            <div className="mt-3.5 flex justify-center">
              <div
                role="tablist"
                aria-label={isEn ? 'Category display filter' : 'تصنيف عرض الفئات'}
                className="inline-flex flex-wrap items-center justify-center gap-1 p-1 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xs"
              >
                {availableTabs.map((tab) => {
                  const selected = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => {
                        setHoveredId(null);
                        setActiveTab(tab.id);
                      }}
                      className={`min-h-[36px] px-2.5 min-[390px]:px-3.5 py-1.5 rounded-lg text-[11px] min-[390px]:text-xs sm:text-[13px] font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)] ${
                        selected
                          ? 'bg-[var(--color-green)] text-white shadow-xs'
                          : 'text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-cream)]/60'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Dynamic Responsive Category Grid with Tactile Card & Medallion Hover Choreography */}
        <div
          onMouseLeave={() => setHoveredId(null)}
          className="mt-6 sm:mt-7 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(152px,1fr))] max-w-6xl mx-auto gap-x-3 gap-y-3.5 sm:gap-x-4 sm:gap-y-4 lg:gap-3.5"
        >
          {visibleMedallions.map((item) => {
            const isActive = activeSpotlightId === item.id;
            const isHovered = hoveredId === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onFilterListings(item.filterPatch)}
                onMouseEnter={() => setHoveredId(item.id)}
                onFocus={() => setHoveredId(item.id)}
                onBlur={() => setHoveredId((prev) => (prev === item.id ? null : prev))}
                className="group relative w-full flex flex-col items-center text-center rounded-2xl px-2.5 py-3 sm:px-3 sm:py-3.5 bg-[var(--color-surface)]/80 dark:bg-[var(--color-surface)]/45 border border-[var(--color-border)]/70 shadow-[0_6px_18px_-14px_rgba(16,60,44,0.14)] dark:shadow-[0_6px_18px_-12px_rgba(0,0,0,0.45)] hover:border-[var(--color-gold)]/55 hover:bg-[var(--color-surface)] dark:hover:bg-[var(--color-surface)]/70 hover:shadow-[0_18px_40px_-14px_rgba(16,60,44,0.22)] dark:hover:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.65)] hover:-translate-y-1.5 hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)] cursor-pointer transition-[transform,background-color,border-color,box-shadow] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none motion-reduce:transform-none"
              >
                {/* Medallion Wrapper with Ambient Radial Aura & Sweeping Gold Crescent */}
                <span className="relative flex items-center justify-center">
                  {/* Soft Radial Emerald/Gold Ambient Aura Revealed Smoothly on Active/Hover */}
                  <span
                    aria-hidden="true"
                    className={`absolute -inset-2 rounded-full bg-[radial-gradient(circle,rgba(199,154,67,0.22)_0%,rgba(16,60,44,0.12)_52%,transparent_72%)] dark:bg-[radial-gradient(circle,rgba(224,168,75,0.22)_0%,rgba(20,92,66,0.18)_52%,transparent_72%)] pointer-events-none transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                      isHovered
                        ? 'opacity-100 scale-105'
                        : isActive
                        ? 'opacity-70 scale-100'
                        : 'opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-105'
                    }`}
                  />

                  <span
                    className={`relative w-[90px] h-[90px] min-[390px]:w-[96px] min-[390px]:h-[96px] sm:w-[104px] sm:h-[104px] xl:w-[106px] xl:h-[106px] rounded-full flex items-center justify-center transition-[transform,background-color,color,box-shadow,border-color] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none motion-reduce:transform-none group-focus-visible:ring-2 group-focus-visible:ring-[var(--color-gold)] group-focus-visible:ring-offset-4 group-focus-visible:ring-offset-[var(--color-canvas)] ${
                      isActive
                        ? 'bg-[var(--color-green)] text-white border border-[var(--color-gold)]/75 -translate-y-1 scale-[1.02] shadow-[0_14px_28px_-10px_rgba(16,60,44,0.42)] dark:shadow-[0_14px_28px_-10px_rgba(0,0,0,0.7)]'
                        : 'bg-[var(--color-surface)] text-[var(--color-green-ink)] border border-[var(--color-border)]/95 shadow-[0_8px_20px_-12px_rgba(16,60,44,0.18)] dark:shadow-[0_8px_20px_-10px_rgba(0,0,0,0.48)] group-hover:-translate-y-1 group-hover:scale-[1.02]'
                    }`}
                  >
                    {/* Signature Saudi Gold Crescent Arc & Outer Gold Ring */}
                    <svg
                      viewBox="0 0 144 144"
                      fill="none"
                      aria-hidden="true"
                      className={`absolute -inset-[5px] w-[calc(100%+10px)] h-[calc(100%+10px)] pointer-events-none transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                        isHovered ? 'rotate-[28deg]' : 'rotate-0'
                      }`}
                    >
                      <circle
                        cx="72"
                        cy="72"
                        r="68"
                        stroke="var(--color-gold)"
                        strokeWidth={isActive ? 2.2 : 1.15}
                        opacity={isActive ? 0.92 : 0.24}
                      />
                      <circle
                        cx="72"
                        cy="72"
                        r="68"
                        stroke="var(--color-gold)"
                        strokeWidth={isActive ? 3.1 : 2.1}
                        strokeLinecap="round"
                        strokeDasharray="136 428"
                        transform="rotate(-98 72 72)"
                        opacity={isActive ? 1 : 0.78}
                        className="transition-opacity duration-200"
                      />
                    </svg>

                    {/* Delicate Inner Concentric Hairline */}
                    <span
                      aria-hidden="true"
                      className={`absolute inset-[6px] rounded-full pointer-events-none transition-colors duration-200 ${
                        isActive
                          ? 'border border-[var(--color-gold)]/35'
                          : 'border border-[var(--color-cream)] dark:border-white/[0.06] group-hover:border-[var(--color-gold)]/35'
                      }`}
                    />

                    <MedallionLivestockIcon
                      kind={item.kind}
                      className={`relative z-[1] w-10 h-10 sm:w-11 sm:h-11 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
                        isHovered ? 'scale-110' : 'group-hover:scale-110'
                      }`}
                    />
                  </span>
                </span>

                {/* Medallion Label, Subtle Descriptor, Expanding Gold Rule & Directional Cue */}
                <span className="mt-2.5 sm:mt-3 block font-display text-sm sm:text-[15px] font-extrabold text-[var(--color-ink)] leading-snug group-hover:text-[var(--color-green-ink)] transition-colors duration-200">
                  {item.name}
                </span>

                <span className="mt-0.5 block text-[11px] sm:text-xs text-[var(--color-muted)] line-clamp-1 max-w-[165px]">
                  {item.subtitle}
                </span>

                <span
                  aria-hidden="true"
                  className={`mt-1.5 block h-px transition-[width,background-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    isHovered
                      ? 'w-11 bg-[var(--color-gold)]'
                      : isActive
                      ? 'w-9 bg-[var(--color-gold)]'
                      : 'w-6 bg-[var(--color-gold)]/45 group-hover:w-11 group-hover:bg-[var(--color-gold)]'
                  }`}
                />

                <span className="relative mt-1 inline-flex items-center justify-center text-xs font-bold tabular-nums text-[var(--color-green-ink)] group-hover:text-[var(--color-gold-hover)] dark:group-hover:text-[var(--color-gold)] transition-colors duration-200">
                  <span>{formatArabicListingCount(item.count, lang)}</span>
                  <DirArrow
                    size={12}
                    aria-hidden="true"
                    className={`absolute ${isEn ? '-right-4' : '-left-4'} top-1/2 -translate-y-1/2 transition-[opacity,transform] duration-200 motion-reduce:transition-none ${
                      isHovered
                        ? 'opacity-100 translate-x-0'
                        : isEn
                        ? 'opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0'
                        : 'opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0'
                    }`}
                  />
                </span>
              </button>
            );
          })}
        </div>

        {/* Centered Browse-All Action */}
        <div className="mt-5 sm:mt-6 flex justify-center">
          <button
            type="button"
            onClick={onBrowseAll}
            className="min-h-[40px] px-5 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-gold)] hover:bg-[var(--color-surface-warm)] text-xs sm:text-sm font-bold text-[var(--color-ink)] inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)] shadow-2xs"
          >
            <span>{isEn ? 'Browse All Categories' : 'استعراض جميع التصنيفات'}</span>
            <DirArrow size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
