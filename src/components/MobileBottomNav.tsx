import { Home, LayoutGrid, MessageSquare, Plus, User as UserIcon } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import type { AuthMode, DashboardTab, PageView } from '../lib/router';
import type { User } from '../types/marketplace';

interface MobileBottomNavProps {
  currentPage: PageView;
  activeDashboardTab?: DashboardTab | null;
  currentUser: User | null;
  unreadMessagesCount?: number;
  unreadNotificationsCount?: number;
  hidden?: boolean;
  onNavigate: (
    page: PageView,
    options?: {
      authMode?: AuthMode;
      dashboardTab?: DashboardTab;
    }
  ) => void;
}

export function MobileBottomNav({
  currentPage,
  activeDashboardTab,
  currentUser,
  unreadMessagesCount = 0,
  unreadNotificationsCount = 0,
  hidden = false,
  onNavigate,
}: MobileBottomNavProps) {
  const { dir, isEn, t } = useI18n();

  if (hidden) return null;

  const isHomeActive = currentPage === 'home';
  const isExploreActive =
    currentPage === 'listings' ||
    currentPage === 'services' ||
    currentPage === 'breeds' ||
    currentPage === 'breeders' ||
    currentPage === 'pricing' ||
    currentPage === 'weights' ||
    currentPage === 'feast' ||
    currentPage === 'transport' ||
    currentPage === 'feed' ||
    currentPage === 'occasions' ||
    currentPage === 'how' ||
    currentPage === 'guides' ||
    currentPage === 'help' ||
    currentPage === 'about' ||
    currentPage === 'rules' ||
    currentPage === 'privacy' ||
    currentPage === 'terms' ||
    currentPage === 'seller';
  const isAddActive = currentPage === 'add';
  const isMessagesActive =
    currentPage === 'dashboard' && activeDashboardTab === 'messages';
  const isAccountActive =
    currentPage === 'login' ||
    (currentPage === 'dashboard' && activeDashboardTab !== 'messages');

  return (
    <nav
      aria-label={isEn ? 'Mobile Quick Navigation' : 'التنقل السريع للجوال'}
      data-testid="mobile-bottom-nav"
      dir={dir}
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--color-surface)]/95 backdrop-blur-md border-t border-[var(--color-border)] shadow-[0_-8px_24px_-12px_rgba(11,58,41,0.18)] pb-[max(0.35rem,env(safe-area-inset-bottom))]"
    >
      <div
        aria-hidden="true"
        className="h-[2px] w-full bg-gradient-to-l from-transparent via-[var(--color-gold)]/55 to-transparent"
      />

      <div className="max-w-lg mx-auto px-1.5 pt-1 grid grid-cols-5 items-end gap-0.5">
        {/* 1. Home */}
        <button
          type="button"
          onClick={() => onNavigate('home')}
          aria-current={isHomeActive ? 'page' : undefined}
          className={`min-h-[50px] rounded-xl flex flex-col items-center justify-center gap-0.5 px-1 py-1 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)] ${
            isHomeActive
              ? 'text-[var(--color-green-ink)] bg-[var(--color-cream)]/90'
              : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
          }`}
        >
          <Home
            size={20}
            strokeWidth={isHomeActive ? 2.4 : 1.9}
            aria-hidden="true"
          />
          <span
            className={`text-[10px] leading-tight whitespace-nowrap ${
              isHomeActive ? 'font-extrabold' : 'font-semibold'
            }`}
          >
            {t.bottomNavHome}
          </span>
        </button>

        {/* 2. Explore Listings */}
        <button
          type="button"
          onClick={() => onNavigate('listings')}
          aria-current={isExploreActive ? 'page' : undefined}
          className={`min-h-[50px] rounded-xl flex flex-col items-center justify-center gap-0.5 px-1 py-1 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)] ${
            isExploreActive
              ? 'text-[var(--color-green-ink)] bg-[var(--color-cream)]/90'
              : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
          }`}
        >
          <LayoutGrid
            size={20}
            strokeWidth={isExploreActive ? 2.4 : 1.9}
            aria-hidden="true"
          />
          <span
            className={`text-[10px] leading-tight whitespace-nowrap ${
              isExploreActive ? 'font-extrabold' : 'font-semibold'
            }`}
          >
            {t.bottomNavListings}
          </span>
        </button>

        {/* 3. Elevated Primary Action: Add Listing */}
        <button
          type="button"
          onClick={() => onNavigate('add')}
          aria-current={isAddActive ? 'page' : undefined}
          aria-label={t.addListing}
          className="min-h-[52px] flex flex-col items-center justify-end gap-0.5 px-1 pb-1 cursor-pointer group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
        >
          <span
            className={`-mt-3 w-11 h-10 rounded-2xl flex items-center justify-center border transition-transform duration-150 group-active:scale-95 shadow-md ${
              isAddActive
                ? 'bg-[var(--color-gold)] text-[#14261D] border-[var(--color-green)]'
                : 'bg-[var(--color-green)] text-[#F4C569] border-[var(--color-gold)]/70'
            }`}
          >
            <Plus size={21} strokeWidth={2.6} aria-hidden="true" />
          </span>
          <span
            className={`text-[10px] leading-tight whitespace-nowrap ${
              isAddActive
                ? 'font-extrabold text-[var(--color-green-ink)]'
                : 'font-bold text-[var(--color-ink)]'
            }`}
          >
            {t.bottomNavAdd}
          </span>
        </button>

        {/* 4. Messages */}
        <button
          type="button"
          onClick={() =>
            currentUser
              ? onNavigate('dashboard', { dashboardTab: 'messages' })
              : onNavigate('login', { authMode: 'login' })
          }
          aria-current={isMessagesActive ? 'page' : undefined}
          aria-label={
            unreadMessagesCount > 0
              ? `${t.bottomNavMessages} (${unreadMessagesCount})`
              : t.bottomNavMessages
          }
          className={`relative min-h-[50px] rounded-xl flex flex-col items-center justify-center gap-0.5 px-1 py-1 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)] ${
            isMessagesActive
              ? 'text-[var(--color-green-ink)] bg-[var(--color-cream)]/90'
              : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
          }`}
        >
          <span className="relative inline-flex items-center justify-center">
            <MessageSquare
              size={20}
              strokeWidth={isMessagesActive ? 2.4 : 1.9}
              aria-hidden="true"
            />
            {unreadMessagesCount > 0 && (
              <span className="absolute -top-1.5 -end-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-gold)] text-[#14261D] text-[10px] font-extrabold tabular-nums flex items-center justify-center border border-[var(--color-surface)] shadow-xs">
                {unreadMessagesCount > 99 ? '+99' : unreadMessagesCount}
              </span>
            )}
          </span>
          <span
            className={`text-[10px] leading-tight whitespace-nowrap ${
              isMessagesActive ? 'font-extrabold' : 'font-semibold'
            }`}
          >
            {t.bottomNavMessages}
          </span>
        </button>

        {/* 5. My Account */}
        <button
          type="button"
          onClick={() =>
            currentUser
              ? onNavigate('dashboard', {
                  dashboardTab: currentUser.role === 'admin' ? 'admin' : 'my-listings',
                })
              : onNavigate('login', { authMode: 'login' })
          }
          aria-current={isAccountActive ? 'page' : undefined}
          className={`relative min-h-[50px] rounded-xl flex flex-col items-center justify-center gap-0.5 px-1 py-1 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)] ${
            isAccountActive
              ? 'text-[var(--color-green-ink)] bg-[var(--color-cream)]/90'
              : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
          }`}
        >
          <span className="relative inline-flex items-center justify-center">
            <UserIcon
              size={20}
              strokeWidth={isAccountActive ? 2.4 : 1.9}
              aria-hidden="true"
            />
            {currentUser && unreadNotificationsCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-0.5 -end-1 w-2.5 h-2.5 rounded-full bg-[var(--color-gold)] border border-[var(--color-surface)]"
              />
            )}
          </span>
          <span
            className={`text-[10px] leading-tight whitespace-nowrap ${
              isAccountActive ? 'font-extrabold' : 'font-semibold'
            }`}
          >
            {currentUser ? t.bottomNavAccount : t.bottomNavLogin}
          </span>
        </button>
      </div>
    </nav>
  );
}
