import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Search, PlusCircle, Home } from 'lucide-react';
import { useStore } from '../../services/store';
import { useT } from '../../i18n';
import { LanguageSwitch } from '../common/LanguageSwitch';
import { ThemeSwitch } from '../common/ThemeSwitch';
import { BrandLogo } from '../common/BrandLogo';

interface TopBarProps {
  onToggleSidebar: () => void;
  onOpenSearch: () => void;
  onOpenNew: () => void;
}

// One bar on every screen: Home and Menu on the left, Search, colour theme,
// language and New bill on the right. Every button has a word, not only an icon.
export const TopBar: React.FC<TopBarProps> = ({ onToggleSidebar, onOpenSearch }) => {
  const { currentStaff } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT();
  const canBill = !currentStaff || currentStaff.permissions.includes('BILLING');
  const onHome = location.pathname === '/dashboard';
  const onBilling = location.pathname.startsWith('/billing');

  const plain = 'h-11 flex items-center gap-2 px-3 border border-os-line text-base hover:border-os-ink transition-colors';

  return (
    <header className="sticky top-0 z-30 bg-os-paper border-t-4 border-t-os-accent border-b border-os-line no-print select-none">
      <div className="max-w-7xl mx-auto h-16 flex items-center justify-between gap-2 px-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onToggleSidebar} className={plain} aria-label={t('Menu')}>
            <Menu size={20} />
            <span className="hidden md:inline">{t('Menu')}</span>
          </button>
          {!onHome && (
            <button onClick={() => navigate('/dashboard')} className={plain} aria-label={t('Home')}>
              <Home size={20} />
              <span className="hidden sm:inline">{t('Home')}</span>
            </button>
          )}
          <button onClick={() => navigate('/dashboard')} className="ml-1 shrink-0 hidden sm:block" aria-label="Origin">
            <BrandLogo height={26} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={onOpenSearch} className={`${plain} text-os-muted`} aria-label={t('Search')}>
            <Search size={20} />
            <span className="hidden lg:inline">{t('Search')}</span>
          </button>
          <ThemeSwitch className="hidden md:flex" />
          <LanguageSwitch />
          {canBill && !onBilling && (
            <button
              onClick={() => navigate('/billing/new')}
              className="h-11 bg-os-accent text-white px-3 sm:px-4 flex items-center gap-2 text-base font-bold hover:bg-os-accent-dark transition-colors"
            >
              <PlusCircle size={20} />
              <span className="hidden sm:inline">{t('New bill')}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
