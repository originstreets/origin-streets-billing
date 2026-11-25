import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, Search, PlusCircle } from 'lucide-react';
import { useStore } from '../../services/store';
import { useT } from '../../i18n';
import { BrandLogo } from '../common/BrandLogo';

interface TopBarProps {
  onToggleSidebar: () => void;
  onOpenSearch: () => void;
  onOpenNew: () => void;
}

// Phones and tablets only: a black bar with the menu, the wordmark, search
// and New bill. On a computer the black rail does all of this.
export const TopBar: React.FC<TopBarProps> = ({ onToggleSidebar, onOpenSearch }) => {
  const { currentStaff } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT();
  const canBill = !currentStaff || currentStaff.permissions.includes('BILLING');
  const onBilling = location.pathname.startsWith('/billing');

  const round = 'h-11 w-11 flex items-center justify-center text-white hover:bg-white/10 transition-colors';

  return (
    <header className="lg:hidden sticky top-0 z-30 bg-os-accent text-white no-print select-none">
      <div className="h-16 flex items-center justify-between gap-2 px-2 sm:px-4">
        <div className="flex items-center gap-1 min-w-0">
          <button onClick={onToggleSidebar} className={round} aria-label={t('Menu')}>
            <Menu size={22} />
          </button>
          <button onClick={() => navigate('/dashboard')} className="ml-1 shrink-0" aria-label={t('Home')}>
            <BrandLogo height={22} tone="white" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={onOpenSearch} className={round} aria-label={t('Search')}>
            <Search size={20} />
          </button>
          {canBill && !onBilling && (
            <button
              onClick={() => navigate('/billing/new')}
              className="h-10 bg-os-highlight text-os-on-highlight px-4 flex items-center gap-2 text-[0.9375rem] font-semibold hover:opacity-90 transition-opacity"
            >
              <PlusCircle size={18} />
              <span className="hidden sm:inline">{t('New bill')}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
