import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Calendar, CheckCircle2, Clock, Layers, MapPin, Plus, RotateCcw, TrendingUp } from 'lucide-react';
import type { Conversation, Listing, PriceOffer, Region } from '../types/marketplace';
import { formatPriceSar } from '../lib/format';
import {
  buildDailyAnalyticsSeries,
  buildRegionAnalyticsSeries,
  computeAnalyticsSummary,
  type AnalyticsDateRangeDays,
  type AnalyticsStatusScope,
  type DailyAnalyticsPoint,
  type RegionAnalyticsPoint,
} from '../lib/analytics';

interface DashboardAnalyticsProps {
  listings: Listing[];
  regions: Region[];
  isAdmin: boolean;
  offers?: PriceOffer[];
  conversations?: Conversation[];
  onAddListing?: () => void;
}

type RegionChartMode = 'bar' | 'pie';

const REGION_PIE_COLORS = [
  'var(--color-chart-bar-top)',
  'var(--color-chart-bar)',
  'var(--color-chart-area)',
  '#3B7A57',
  '#8C6D3F',
  '#64748B',
  '#0F766E',
  '#B45309',
];

function DailyTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const point: DailyAnalyticsPoint = payload[0].payload;
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3.5 py-2.5 shadow-md text-right text-xs space-y-1">
      <p className="font-display font-bold text-[var(--color-ink)]">{point.label}</p>
      <p className="text-[var(--color-green-ink)] font-semibold tabular-nums">
        إجمالي الإعلانات الجديدة: {point.count}
      </p>
      <p className="text-[var(--color-muted)] tabular-nums">
        منشور: {point.published} · بانتظار المراجعة: {point.pending}
      </p>
    </div>
  );
}

function RegionTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const point: RegionAnalyticsPoint = payload[0].payload;
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3.5 py-2.5 shadow-md text-right text-xs space-y-1">
      <p className="font-display font-bold text-[var(--color-ink)]">{point.name}</p>
      <p className="text-[var(--color-green-ink)] font-semibold tabular-nums">
        عدد الإعلانات: {point.count} ({point.sharePercent}%)
      </p>
      <p className="text-[var(--color-muted)] tabular-nums">
        إجمالي الرؤوس: {point.totalHeads} رأس
      </p>
      {point.avgPrice > 0 && (
        <p className="text-[var(--color-muted)] tabular-nums">
          متوسط السعر: {formatPriceSar(point.avgPrice)}
        </p>
      )}
    </div>
  );
}

export function DashboardAnalytics({
  listings,
  regions,
  isAdmin,
  offers = [],
  conversations = [],
  onAddListing,
}: DashboardAnalyticsProps) {
  const [rangeDays, setRangeDays] = useState<AnalyticsDateRangeDays>(7);
  const [statusScope, setStatusScope] = useState<AnalyticsStatusScope>('all');
  const [regionChartMode, setRegionChartMode] = useState<RegionChartMode>('bar');

  const scopedListings = useMemo(() => {
    if (statusScope === 'all') return listings;
    return listings.filter((l) => l.status === statusScope);
  }, [listings, statusScope]);

  const summary = useMemo(
    () =>
      computeAnalyticsSummary({
        listings,
        offers,
        conversations,
      }),
    [listings, offers, conversations]
  );

  const dailyData = useMemo<DailyAnalyticsPoint[]>(
    () =>
      buildDailyAnalyticsSeries({
        allScopedListings: listings,
        filteredListings: scopedListings,
        rangeDays,
      }),
    [listings, scopedListings, rangeDays]
  );

  const regionData = useMemo<RegionAnalyticsPoint[]>(
    () =>
      buildRegionAnalyticsSeries({
        filteredListings: scopedListings,
        regions,
      }),
    [regions, scopedListings]
  );

  const activeRegionData = useMemo(
    () => regionData.filter((r) => r.count > 0),
    [regionData]
  );

  const activeRegionsCount = activeRegionData.length;
  const topRegion = regionData[0];

  return (
    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 sm:p-6 space-y-6 transition-colors">
      {/* Header & Interactive Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[var(--color-border)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[var(--color-green-ink)]">
            <BarChart3 size={18} aria-hidden="true" />
            <h2 className="font-display text-lg sm:text-xl font-bold text-[var(--color-ink)]">
              {isAdmin ? 'لوحة تحكم الأداء — إحصائيات المنصة' : 'تحليلات إعلاناتي وأدائي'}
            </h2>
          </div>
          <p className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
            {isAdmin
              ? 'مؤشرات الإعلانات الجديدة يومياً وتوزيعها الجغرافي عبر مناطق المملكة بالتاريخ الميلادي'
              : 'إحصائيات خاصة بإعلاناتك ونشاطك الشخصي فقط (دون خلطها بإحصائيات السوق العامة) وبالتاريخ الميلادي'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Date Range Segmented Control */}
          <div
            role="group"
            aria-label="النطاق الزمني للتحليلات"
            className="inline-flex items-center gap-1 p-1 rounded-lg bg-[var(--color-cream)] border border-[var(--color-border)] max-w-full overflow-x-auto"
          >
            {([7, 14, 30] as const).map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={rangeDays === days}
                onClick={() => setRangeDays(days)}
                className={`min-h-[36px] px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  rangeDays === days
                    ? 'bg-[var(--color-green)] text-white'
                    : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                }`}
              >
                آخر {days} {days === 7 ? 'أيام' : 'يوماً'}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <select
            aria-label="تصفية الإحصائيات حسب الحالة"
            value={statusScope}
            onChange={(e) => setStatusScope(e.target.value as AnalyticsStatusScope)}
            className="h-10 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-green-ink)]"
          >
            <option value="all">جميع الحالات ({summary.totalListings})</option>
            <option value="Published">المنشورة فقط ({summary.publishedCount})</option>
            <option value="Pending">بانتظار المراجعة ({summary.pendingCount})</option>
            <option value="Rejected">المرفوضة ({summary.rejectedCount})</option>
            <option value="Draft">المسودات ({summary.draftCount})</option>
            <option value="Expired">المنتهية ({summary.expiredCount})</option>
            <option value="Sold">المباعة ({summary.soldCount})</option>
          </select>
        </div>
      </div>

      {/* Primary KPI Strip */}
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 divide-y min-[420px]:divide-y-0 min-[420px]:divide-x min-[420px]:divide-x-reverse divide-[var(--color-border)] border border-[var(--color-border)] rounded-xl bg-[var(--color-cream)]/45 overflow-hidden">
        <div className="p-4 sm:p-5 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-[var(--color-muted)]">
              {isAdmin ? 'إجمالي الإعلانات المرصودة' : 'إعلاناتي المرصودة'}
            </p>
            <Layers size={15} className="text-[var(--color-green-ink)] shrink-0" aria-hidden="true" />
          </div>
          <p className="font-display text-2xl font-extrabold text-[var(--color-ink)] tabular-nums">
            {scopedListings.length}
          </p>
          <p className="text-[11px] text-[var(--color-muted)] tabular-nums">
            إجمالي الرؤوس: {summary.totalHeads} رأس
          </p>
        </div>
        <div className="p-4 sm:p-5 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-[var(--color-muted)]">الإعلانات المنشورة</p>
            <CheckCircle2 size={15} className="text-[var(--color-green-ink)] shrink-0" aria-hidden="true" />
          </div>
          <p className="font-display text-2xl font-extrabold text-[var(--color-green-ink)] tabular-nums">
            {summary.publishedCount}
          </p>
          <p className="text-[11px] text-[var(--color-muted)] tabular-nums">
            المباعة: {summary.soldCount} · المسودات: {summary.draftCount}
          </p>
        </div>
        <div className="p-4 sm:p-5 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-[var(--color-muted)]">بانتظار المراجعة</p>
            <Clock size={15} className="text-[var(--color-gold)] shrink-0" aria-hidden="true" />
          </div>
          <p className="font-display text-2xl font-extrabold text-[var(--color-gold)] tabular-nums">
            {summary.pendingCount}
          </p>
          <p className="text-[11px] text-[var(--color-muted)] tabular-nums">
            {isAdmin
              ? `متوسط السعر: ${summary.averagePrice > 0 ? formatPriceSar(summary.averagePrice) : '—'}`
              : `إعجابات إعلاناتي: ${summary.totalLikes}`}
          </p>
        </div>
        <div className="p-4 sm:p-5 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-[var(--color-muted)]">
              {isAdmin ? 'المناطق النشطة' : 'التفاعل والعروض الواردة'}
            </p>
            <TrendingUp size={15} className="text-[var(--color-green-ink)] shrink-0" aria-hidden="true" />
          </div>
          {isAdmin ? (
            <>
              <p className="font-display text-2xl font-extrabold text-[var(--color-ink)] tabular-nums">
                {activeRegionsCount} / {regions.length}
              </p>
              {topRegion && topRegion.count > 0 && (
                <p className="text-[11px] text-[var(--color-muted)] truncate">
                  الأعلى: {topRegion.name} ({topRegion.count})
                </p>
              )}
            </>
          ) : (
            <>
              <p className="font-display text-2xl font-extrabold text-[var(--color-ink)] tabular-nums">
                {summary.incomingOffersCount} عرض
              </p>
              <p className="text-[11px] text-[var(--color-muted)] tabular-nums truncate">
                بانتظار الرد: {summary.pendingOffersCount} · محادثات: {summary.sellerConversationsCount}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Empty States or Charts */}
      {listings.length === 0 ? (
        <div className="py-12 px-6 text-center rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/40 space-y-3">
          <p className="font-display text-base sm:text-lg font-bold text-[var(--color-ink)]">
            {isAdmin
              ? 'لا توجد إعلانات في المنصة لعرض تحليلاتها حالياً'
              : 'لا توجد إعلانات خاصة بحسابك لتحليل أدائها بعد'}
          </p>
          <p className="text-xs sm:text-sm text-[var(--color-muted)] max-w-md mx-auto leading-relaxed">
            {isAdmin
              ? 'ستظهر المؤشرات اليومية والتوزيع الجغرافي بمجرد تسجيل إعلانات جديدة.'
              : 'أضف إعلانك الأول لتبدأ بمتابعة عدد الرؤوس وحالة المراجعة وتفاعل المشترين وإحصائيات المناطق الخاصة بحسابك.'}
          </p>
          {!isAdmin && onAddListing && (
            <button
              type="button"
              onClick={onAddListing}
              className="mt-2 inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs sm:text-sm font-semibold cursor-pointer"
            >
              <Plus size={16} aria-hidden="true" />
              <span>أضف إعلانك الأول</span>
            </button>
          )}
        </div>
      ) : scopedListings.length === 0 ? (
        <div className="py-12 px-6 text-center rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/40">
          <p className="font-display text-base font-bold text-[var(--color-ink)]">
            لا توجد إعلانات مطابقة لنطاق التصفية المحدد
          </p>
          <p className="text-xs text-[var(--color-muted)] mt-1">
            جرّب اختيار «جميع الحالات» لعرض توزيع الإعلانات اليومي والجهوي.
          </p>
          <button
            type="button"
            onClick={() => {
              setStatusScope('all');
              setRangeDays(7);
            }}
            className="mt-4 inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-lg bg-[var(--color-green)] hover:bg-[var(--color-green-hover)] text-white text-xs font-semibold cursor-pointer"
          >
            <RotateCcw size={13} aria-hidden="true" />
            <span>إعادة ضبط العرض</span>
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-1">
            {/* Chart 1: Daily New Listings */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/20 p-4 sm:p-5 space-y-3 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2">
                  <Calendar size={15} className="text-[var(--color-green-ink)]" aria-hidden="true" />
                  <h3 className="font-display text-base font-bold text-[var(--color-ink)]">
                    {isAdmin ? 'عدد الإعلانات الجديدة يومياً' : 'إعلاناتي الجديدة يومياً'}
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-muted)] tabular-nums">
                  آخر {rangeDays} {rangeDays === 7 ? 'أيام' : 'يوماً'}
                </span>
              </div>

              <div className="h-[290px] w-full min-w-0 pt-2" dir="ltr">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={270}>
                  <AreaChart data={dailyData} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dailyListingsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-chart-area)" stopOpacity={0.32} />
                        <stop offset="95%" stopColor="var(--color-chart-area)" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="dailyPublishedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-gold)" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="var(--color-gold)" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-chart-grid)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: 'var(--color-chart-tick)', fontSize: 11 }}
                      axisLine={{ stroke: 'var(--color-chart-grid)' }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: 'var(--color-chart-tick)', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<DailyTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                      formatter={(value) => (
                        <span className="text-[var(--color-muted)]">{value}</span>
                      )}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="إجمالي الإعلانات"
                      stroke="var(--color-chart-area)"
                      strokeWidth={2.5}
                      fill="url(#dailyListingsGrad)"
                      activeDot={{
                        r: 5,
                        fill: 'var(--color-gold)',
                        stroke: 'var(--color-chart-area)',
                        strokeWidth: 2,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="published"
                      name="المنشورة"
                      stroke="var(--color-gold)"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      fill="url(#dailyPublishedGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Listings Distribution by Region */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-cream)]/20 p-4 sm:p-5 space-y-3 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2">
                  <MapPin size={15} className="text-[var(--color-gold)]" aria-hidden="true" />
                  <h3 className="font-display text-base font-bold text-[var(--color-ink)]">
                    {isAdmin ? 'توزيع الإعلانات حسب المناطق' : 'توزيع إعلاناتي حسب المناطق'}
                  </h3>
                </div>

                <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-[var(--color-cream)] border border-[var(--color-border)]">
                  <button
                    type="button"
                    aria-pressed={regionChartMode === 'bar'}
                    onClick={() => setRegionChartMode('bar')}
                    className={`min-h-[32px] px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      regionChartMode === 'bar'
                        ? 'bg-[var(--color-green)] text-white'
                        : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                    }`}
                  >
                    أعمدة
                  </button>
                  <button
                    type="button"
                    aria-pressed={regionChartMode === 'pie'}
                    onClick={() => setRegionChartMode('pie')}
                    className={`min-h-[32px] px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      regionChartMode === 'pie'
                        ? 'bg-[var(--color-green)] text-white'
                        : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                    }`}
                  >
                    نسب دائرية
                  </button>
                </div>
              </div>

              <div className="h-[290px] w-full min-w-0 pt-2" dir="ltr">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={270}>
                  {regionChartMode === 'bar' ? (
                    <BarChart data={regionData} margin={{ top: 10, right: 12, left: -16, bottom: 16 }}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--color-chart-grid)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: 'var(--color-chart-tick)', fontSize: 11 }}
                        axisLine={{ stroke: 'var(--color-chart-grid)' }}
                        tickLine={false}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        height={52}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: 'var(--color-chart-tick)', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<RegionTooltip />} />
                      <Bar dataKey="count" name="عدد الإعلانات" radius={[6, 6, 0, 0]} maxBarSize={38}>
                        {regionData.map((entry, idx) => (
                          <Cell
                            key={entry.regionId}
                            fill={
                              idx === 0 && entry.count > 0
                                ? 'var(--color-chart-bar-top)'
                                : 'var(--color-chart-bar)'
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  ) : (
                    <PieChart>
                      <Pie
                        data={activeRegionData}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="46%"
                        innerRadius={56}
                        outerRadius={92}
                        paddingAngle={3}
                      >
                        {activeRegionData.map((entry, idx) => (
                          <Cell
                            key={entry.regionId}
                            fill={REGION_PIE_COLORS[idx % REGION_PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<RegionTooltip />} />
                      <Legend
                        wrapperStyle={{ fontSize: '11px' }}
                        formatter={(value) => (
                          <span style={{ color: 'var(--color-muted)' }}>{value}</span>
                        )}
                      />
                    </PieChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Regional Breakdown Summary */}
          {activeRegionData.length > 0 && (
            <div className="pt-4 border-t border-[var(--color-border)] space-y-3">
              <p className="text-xs font-bold text-[var(--color-ink)]">
                {isAdmin
                  ? 'ملخص الأداء الجغرافي حسب المناطق النشطة'
                  : 'ملخص توزيع إعلاناتك حسب المناطق'}
              </p>

              {/* Mobile cards (< 640px) */}
              <div className="sm:hidden space-y-2.5">
                {activeRegionData.map((reg) => (
                  <div
                    key={reg.regionId}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-cream)]/40 p-3 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-[var(--color-ink)] truncate">{reg.name}</p>
                      <p className="text-[11px] text-[var(--color-muted)] tabular-nums mt-0.5">
                        {reg.totalHeads} رأس · متوسط: {reg.avgPrice > 0 ? formatPriceSar(reg.avgPrice) : '—'}
                      </p>
                    </div>
                    <div className="text-left shrink-0 tabular-nums">
                      <p className="font-bold text-[var(--color-green-ink)]">{reg.count} إعلان</p>
                      <p className="text-[11px] text-[var(--color-muted)]">{reg.sharePercent}%</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop / Tablet table */}
              <div className="hidden sm:block overflow-x-auto rounded-xl border border-[var(--color-border)]">
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--color-cream)] border-b border-[var(--color-border)] text-[var(--color-muted)]">
                      <th className="py-2.5 px-4 font-semibold">المنطقة</th>
                      <th className="py-2.5 px-4 font-semibold">عدد الإعلانات</th>
                      <th className="py-2.5 px-4 font-semibold">
                        {isAdmin ? 'النسبة من السوق' : 'النسبة من إعلاناتك'}
                      </th>
                      <th className="py-2.5 px-4 font-semibold">إجمالي الرؤوس</th>
                      <th className="py-2.5 px-4 font-semibold">متوسط السعر</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
                    {activeRegionData.map((reg) => (
                      <tr key={reg.regionId} className="hover:bg-[var(--color-cream)]/40">
                        <td className="py-2.5 px-4 font-semibold text-[var(--color-ink)]">
                          {reg.name}
                        </td>
                        <td className="py-2.5 px-4 font-bold text-[var(--color-green-ink)] tabular-nums">
                          {reg.count}
                        </td>
                        <td className="py-2.5 px-4 text-[var(--color-muted)] tabular-nums">
                          {reg.sharePercent}%
                        </td>
                        <td className="py-2.5 px-4 text-[var(--color-ink)] tabular-nums">
                          {reg.totalHeads} رأس
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-[var(--color-ink)] tabular-nums">
                          {reg.avgPrice > 0 ? formatPriceSar(reg.avgPrice) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
