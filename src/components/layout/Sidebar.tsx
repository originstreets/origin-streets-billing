import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  Receipt,
  Shirt,
  Users,
  Settings,
  X,
  Search,
  RotateCcw,
  Tag,
  FileCheck,
  CalendarRange,
  LogOut,
} from 'lucide-react';
import { store, useStore } from '../../services/store';
import { PermissionKey } from '../../constants/permissions';
import { signOut } from '../../api/auth';
import { useT } from '../../i18n';
import { roleWord } from '../../utils/roleWord';
import { useScrollLock } from '../../utils/useScrollLock';
import { BrandLogo } from '../common/BrandLogo';
import { ThemeSwitch } from '../common/ThemeSwitch';
import { LanguageSwitch } from '../common/LanguageSwitch';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSearch: () => void;
  onOpenNew: () => void;
}

const DESKTOP = '(min-width: 1024px)';

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const onChange = () => setDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return desktop;
}

// Origin's black rail: always on screen beside the page on a computer, a
// drawer from the left on a phone. The wordmark, New bill and Search on top,
// every screen in the middle, the person, theme, language and sign out below.
export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, onOpenSearch }) => {
  const location = useLocation();
  const { currentStaff } = useStore();
  const t = useT();
  const desktop = useIsDesktop();
  const shown = desktop || isOpen;
  // The page behind stays still while the drawer is open on a phone.
  useScrollLock(isOpen && !desktop);

  useEffect(() => {
    if (!isOpen || desktop) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, desktop, onClose]);

  const allNavItems: Array<{ label: string; path: string; icon: React.ReactNode; permission: PermissionKey }> = [
    { label: t('Home'), path: '/dashboard', icon: <LayoutDashboard size={19} />, permission: 'DASHBOARD' },
    { label: t('All bills'), path: '/bills', icon: <Receipt size={19} />, permission: 'BILLS' },
    { label: t('Products & stock'), path: '/products', icon: <Shirt size={19} />, permission: 'PRODUCTS' },
    { label: t('Customers'), path: '/customers', icon: <Users size={19} />, permission: 'CUSTOMERS' },
    { label: t('Price tags'), path: '/tags', icon: <Tag size={19} />, permission: 'TAGS' },
    { label: t('Check sales'), path: '/audit', icon: <FileCheck size={19} />, permission: 'AUDIT' },
    { label: t('Monthly GST report'), path: '/monthly-bills', icon: <CalendarRange size={19} />, permission: 'MONTHLY_BILLS' },
    { label: t('Settings & staff'), path: '/settings', icon: <Settings size={19} />, permission: 'SETTINGS' },
  ];

  // Nothing loaded yet (still fetching currentStaff) -> show everything rather
  // than flashing an empty rail; once currentStaff arrives, filter for real.
  const can = (p: PermissionKey) => !currentStaff || currentStaff.permissions.includes(p);
  const navItems = allNavItems.filter((item) => can(item.permission));

  const isActive = (path: string) =>
    location.pathname === path ||
    (path !== '/dashboard' && location.pathname.startsWith(path)) ||
    (path === '/bills' && (location.pathname.startsWith('/invoices') || location.pathname.startsWith('/orders')));

  const closeOnPhone = () => {
    if (!desktop) onClose();
  };

  return (
    <>
      {isOpen && !desktop && <div className="fixed inset-0 bg-os-ink/60 z-40" onClick={onClose} />}

      <aside
        aria-hidden={!shown}
        className={`os-rail fixed top-0 bottom-0 left-0 z-50 lg:z-30 w-[17rem] max-w-[86vw] bg-os-ink text-white flex flex-col transition-transform duration-200 ${
          shown ? 'translate-x-0' : '-translate-x-full invisible'
        } no-print select-none`}
      >
        <div className="px-6 pt-7 pb-6 flex items-start justify-between gap-3">
          <NavLink to="/dashboard" onClick={closeOnPhone} className="block rounded-sm" aria-label={t('Home')}>
            <BrandLogo height={28} tone="white" />
            <span className="block mt-2 text-[0.8125rem] font-semibold text-white/55">{t('Billing')}</span>
          </NavLink>
          {!desktop && (
            <button
              onClick={onClose}
              className="h-10 w-10 -mr-2 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10"
              aria-label={t('Close menu')}
            >
              <X size={22} />
            </button>
          )}
        </div>

        <div className="px-4 pb-4 space-y-2">
          {can('BILLING') && (
            <NavLink
              to="/billing/new"
              onClick={closeOnPhone}
              className="w-full h-12 rounded-full bg-os-highlight text-os-on-highlight px-5 flex items-center gap-2.5 text-base font-semibold hover:opacity-90 transition-opacity"
            >
              <PlusCircle size={20} />
              <span>{t('New bill')}</span>
            </NavLink>
          )}
          <button
            onClick={() => {
              closeOnPhone();
              onOpenSearch();
            }}
            className="w-full h-11 rounded-full ring-1 ring-inset ring-white/20 text-white/75 px-5 flex items-center gap-2.5 text-[0.9375rem] hover:ring-white/50 hover:text-white transition-colors"
          >
            <Search size={18} />
            <span className="flex-1 text-left">{t('Search')}</span>
            {desktop && <kbd className="text-xs font-sans text-white/45">Ctrl K</kbd>}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-0.5" aria-label={t('Menu')}>
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={closeOnPhone}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 px-4 h-11 rounded-full text-[0.9375rem] transition-colors ${
                  active ? 'bg-os-highlight text-os-on-highlight font-semibold' : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="px-6 py-5 border-t border-white/10 space-y-4">
          {currentStaff && (
            <div className="text-sm leading-tight">
              <div className="font-semibold text-white truncate">{currentStaff.name}</div>
              <div className="text-white/55 mt-0.5">{t(roleWord(currentStaff.role))}</div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <ThemeSwitch tone="dark" />
            <LanguageSwitch tone="dark" />
          </div>
          <div className="flex items-center gap-1 -ml-2">
            <button
              onClick={() => store.reloadFromDatabase()}
              className="h-9 px-3 rounded-full text-sm text-white/70 hover:text-white hover:bg-white/10 flex items-center gap-1.5"
            >
              <RotateCcw size={15} />
              <span>{t('Refresh')}</span>
            </button>
            <button
              onClick={async () => {
                await signOut();
                // A full reload clears everything this login loaded before the next person signs in.
                window.location.replace('/login');
              }}
              className="h-9 px-3 rounded-full text-sm text-white/70 hover:text-white hover:bg-white/10 flex items-center gap-1.5"
            >
              <LogOut size={15} />
              <span>{t('Sign out')}</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
