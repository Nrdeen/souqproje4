import {
  BREED_LABEL_BY_ID,
  REGION_LABEL_BY_ID,
} from './saudiQueryNormalizer';
import type { AiProvider, AiProviderInput, AiProviderOutput } from './types';

function formatSar(amount: number): string {
  return `${Math.round(amount).toLocaleString('en-US')} ر.س`;
}

export class MockAiProvider implements AiProvider {
  readonly name = 'mock' as const;

  async generateReply(input: AiProviderInput): Promise<AiProviderOutput> {
    const { context, userMessage } = input;
    const {
      intent,
      listings,
      totalMatchingListings,
      breedGuides,
      normalizedQuery,
      clarificationStage,
    } = context;
    const norm = normalizedQuery.normalizedText;

    if (intent === 'greeting') {
      if (/السلام عليكم|سلام عليكم|سلام\b/u.test(norm)) {
        return {
          provider: 'mock',
          text: 'وعليكم السلام ورحمة الله وبركاته، حيّاك الله! كيف أقدر أساعدك؟',
        };
      }
      if (/صباح الخير|صباح النور/u.test(norm)) {
        return {
          provider: 'mock',
          text: 'صباح النور! حيّاك الله في سوق الغنم.',
        };
      }
      if (/مساء الخير|مساء النور/u.test(norm)) {
        return {
          provider: 'mock',
          text: 'مساء النور والسرور! حيّاك الله، كيف أقدر أخدمك اليوم؟',
        };
      }
      return {
        provider: 'mock',
        text: 'هلا والله وحيّاك! تحت أمرك، وش حاب تسأل عنه اليوم؟',
      };
    }

    if (intent === 'casual_chat') {
      if (/كيف\s+حالك|كيفك|شلونك|وش\s+اخبارك|اخبارك|علومك/u.test(norm)) {
        return {
          provider: 'mock',
          text: 'الحمد لله بخير، تسلم على سؤالك! كيف أقدر أخدمك اليوم؟',
        };
      }
      if (/وش\s+اسمك|ما\s+اسمك|من\s+انت|مين\s+انت|عرفني\s+عليك/u.test(norm)) {
        return {
          provider: 'mock',
          text: 'أنا المساعد الذكي لسوق الغنم، أساعدك في البحث عن المواشي والسلالات والأسعار واستخدام المنصة.',
        };
      }
      if (/انت\s+(?:انسان|بشر|حقيقي|روبوت|بوت|ذكاء)/u.test(norm)) {
        return {
          provider: 'mock',
          text: 'لا، أنا مساعد ذكاء اصطناعي في سوق الغنم، لكن أقدر أساعدك بكل سرور.',
        };
      }
      if (/مشكور|مشكوره|شكرا|يعطيك\s+العافيه|ما\s+قصرت|تسلم|جزاك\s+الله|بيض\s+الله/u.test(norm)) {
        return {
          provider: 'mock',
          text: 'العفو، حياك الله! إذا احتجت أي شيء ثاني أنا موجود.',
        };
      }
      if (/طفشان|ملل|زهقان|ضاق\s+صدري/u.test(norm)) {
        return {
          provider: 'mock',
          text: 'الله يعينك! ودك نسولف شوي، أو أساعدك بشيء في السوق؟',
        };
      }
      if (/مع\s+السلامه|فمان\s+الله|تصبح\s+على\s+خير/u.test(norm)) {
        return {
          provider: 'mock',
          text: 'في أمان الله، ونشوفك على خير!',
        };
      }
      if (/[A-Za-z]{4,}/.test(userMessage) && !/[\u0600-\u06FF]/.test(userMessage)) {
        return {
          provider: 'mock',
          text: 'Hello! I am the SouqAlGhanam assistant. Happy to chat or help you find Saudi livestock breeds, prices, or listings.',
        };
      }
      return {
        provider: 'mock',
        text: 'حيّاك الله! يسعدني الحديث معك، وإذا احتجت مساعدة في أي موضوع أو في سوق الغنم فأنا حاضر.',
      };
    }

    if (intent === 'marketplace_help') {
      if (/تعديل|اعدل|حذف|اضيف|انشر/u.test(norm)) {
        return {
          provider: 'mock',
          text: [
            'تقدر تضيف إعلانك أو تعدله بسهولة:',
            '• من زر «أضف إعلانك» تعبّي بيانات الحلال (السلالة، العمر، الوزن، التحصين، الصور والسعر) وتحفظه كمسودة أو ترسله للمراجعة.',
            '• ولتعديل إعلان سابق أو تغيير حالته لمباع، ادخل إلى «لوحة حسابي» ثم «إعلاناتي».',
          ].join('\n'),
        };
      }
      return {
        provider: 'mock',
        text: [
          'إليك خطوات التعامل في سوق الغنم:',
          '• للتفاوض أو إظهار رقم البائع: افتح الإعلان وسجل دخولك لتقديم عرض سعر (سوم) أو مراسلة المربي مباشرة.',
          '• الدفع والمعاينة: لا يوجد دفع إلكتروني داخل المنصة، ويتم البيع والشراء بعد المعاينة المباشرة والاتفاق.',
        ].join('\n'),
      };
    }

    if (intent === 'breed_prices') {
      const targetGuides = breedGuides.slice(0, 3);
      if (targetGuides.length === 0) {
        return {
          provider: 'mock',
          text: 'يمكنك مراجعة دليل السلالات والأسعار الاسترشادية من القائمة الرئيسية للاطلاع على أحدث النطاقات السعرية.',
        };
      }
      const isCompare = /(?:(?:ال)?فرق\s+بين|قارن|مقارن|ايهما\s+افضل)/u.test(norm);
      const lines = targetGuides.map((g) =>
        isCompare && g.summary
          ? `• ${g.breedName} (${g.origin}): ${g.summary} (متوسط الوزن ${g.avgWeightKg}، المدى الاسترشادي ${g.priceRangeSar}).`
          : `• ${g.breedName} (${g.origin}): المدى الاسترشادي ${g.priceRangeSar}، متوسط الوزن ${g.avgWeightKg}.`
      );
      return {
        provider: 'mock',
        text: [
          isCompare
            ? 'أبرز الفروقات والبيانات المسجلة في دليل السلالات:'
            : 'الأسعار الاسترشادية المسجلة حالياً في دليل السلالات:',
          ...lines,
          'إذا حاب أبحث لك عن عروض فعلية بسعر معين في منطقتك، خبرني بالسلالة والمنطقة.',
        ].join('\n'),
      };
    }

    if (intent === 'marketplace_search') {
      if (clarificationStage === 'ask_region') {
        const breedName = normalizedQuery.breedId
          ? BREED_LABEL_BY_ID[normalizedQuery.breedId]
          : undefined;
        return {
          provider: 'mock',
          text: breedName
            ? `أكيد، تبحث عن ${breedName} — في أي منطقة تبحث؟`
            : 'أكيد، في أي منطقة تبحث؟',
        };
      }

      if (clarificationStage === 'ask_budget') {
        const breedName = normalizedQuery.breedId
          ? BREED_LABEL_BY_ID[normalizedQuery.breedId] || ''
          : '';
        const regionName = normalizedQuery.city
          ? normalizedQuery.city
          : normalizedQuery.regionId
          ? REGION_LABEL_BY_ID[normalizedQuery.regionId] || ''
          : '';
        return {
          provider: 'mock',
          text: `تمام، تبحث عن ${breedName ? `${breedName} ` : ''}${regionName ? `في ${regionName}` : ''}. عندك ميزانية معينة؟`.trim(),
        };
      }

      if (listings.length > 0) {
        const filterHint =
          normalizedQuery.detectedDialectTerms.length > 0
            ? ` (${normalizedQuery.detectedDialectTerms.join('، ')})`
            : '';
        const topLines = listings.slice(0, 3).map(
          (l) =>
            `• ${l.title} — ${formatSar(l.priceAmount)} (${l.regionName}${
              l.city ? ` - ${l.city}` : ''
            }${l.sellerVerified ? ' · مربي موثق' : ''})`
        );
        return {
          provider: 'mock',
          text: [
            `لقيت ${totalMatchingListings} إعلان منشور${filterHint}:`,
            ...topLines,
            'تقدر تفتح أي بطاقة بالأسفل للتفاصيل أو تعديل الشروط في أي وقت.',
          ].join('\n'),
        };
      }

      return {
        provider: 'mock',
        text: 'ما لقيت حالياً إعلانات منشورة مطابقة تماماً لهذه المعايير. جرب توسيع نطاق السعر أو اختيار منطقة ثانية، وراح أبحث لك فوراً.',
      };
    }

    if (/تحصين|تطعيم|دموي|معوي|بيطر|صحه|فحص|معاينه/u.test(norm)) {
      return {
        provider: 'mock',
        text: [
          'عند معاينة الحلال قبل الشراء تأكد من:',
          '1. التحصينات الأساسية (الدموي والمعوي والجدري حسب الموسم).',
          '2. نشاط الحلال وسلامة العيون والأنف والقوائم والأسنان (لتقدير العمر).',
          '3. المعاينة المباشرة قبل الاتفاق المالي.',
        ].join('\n'),
      };
    }

    return {
      provider: 'mock',
      text: 'أهلاً بك! يسعدني أساعدك سواء في البحث عن المواشي حسب السلالة والمنطقة والسعر أو في الاستفسار عن السلالات والمنصة.',
    };
  }
}
