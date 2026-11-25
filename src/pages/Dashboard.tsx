import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../services/store';
import { formatINR, istToday } from '../utils/formatters';
import {
  Receipt,
  Shirt,
  Users,
  Tag,
  FileCheck,
  CalendarRange,
  Settings,
  ArrowRight,
  Store,
  Globe,
} from 'lucide-react';
import { useT } from '../i18n';
import { paymentWord } from '../utils/paymentWords';
import { PermissionKey } from '../constants/permissions';
import { productStockSummary } from '../utils/stock';

// Home: the New bill pill first, today's numbers, then one panel per job.
export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { orders, products, settings, currentStaff } = useStore();
  const t = useT();
  const can = (p: PermissionKey) => !currentStaff || currentStaff.permissions.includes(p);

  // Today = since midnight IST. Cancelled bills are not sales.
  const today = istToday();
  const todayBills = orders.filter((o) => o.createdAt.startsWith(today) && o.billStatus !== 'VOID');
  const todaySales = todayBills.reduce((sum, o) => sum + o.grandTotal, 0);
  const averageBill = todayBills.length > 0 ? Math.round(todaySales / todayBills.length) : 0;
  const needRestock = products.filter((p) => productStockSummary(p, settings.lowStockThreshold).status !== 'IN_STOCK').length;

  const tiles: { perm: PermissionKey; path: string; icon: React.ReactNode; title: string; text: string; badge?: string }[] = [
    { perm: 'BILLS', path: '/bills', icon: <Receipt size={26} />, title: t('All bills'), text: t('See, print or cancel a bill') },
    {
      perm: 'PRODUCTS',
      path: '/products',
      icon: <Shirt size={26} />,
      title: t('Products & stock'),
      text: t('How many pieces are left'),
      badge: needRestock > 0 ? t('{n} need restock', { n: needRestock }) : undefined,
    },
    { perm: 'CUSTOMERS', path: '/customers', icon: <Users size={26} />, title: t('Customers'), text: t('Names, phones, what they bought') },
    { perm: 'TAGS', path: '/tags', icon: <Tag size={26} />, title: t('Price tags'), text: t('Print tags with barcode') },
    { perm: 'AUDIT', path: '/audit', icon: <FileCheck size={26} />, title: t('Check sales'), text: t('Sales, cash count') },
    { perm: 'MONTHLY_BILLS', path: '/monthly-bills', icon: <CalendarRange size={26} />, title: t('Monthly GST report'), text: t('One PDF for the month') },
    { perm: 'SETTINGS', path: '/settings', icon: <Settings size={26} />, title: t('Settings & staff'), text: t('Shop details, GST, logins') },
  ];

  const stat = (label: React.ReactNode, value: React.ReactNode, muted = false) => (
    <div className="card p-5 sm:p-6 min-w-0">
      <div className="label flex items-center gap-1.5">{label}</div>
      <div className={`font-display text-[2rem] sm:text-[2.6rem] leading-none mt-3 break-words ${muted ? 'text-os-muted' : ''}`}>{value}</div>
    </div>
  );

  return (
    <div className="space-y-10 sm:space-y-12">
      <header>
        <h1 className="page-title">{currentStaff ? t('Hello, {name}', { name: currentStaff.name }) : t('Home')}</h1>
        <p className="text-lg text-os-muted mt-3">{t('What do you want to do?')}</p>
      </header>

      {can('BILLING') && (
        <button
          onClick={() => navigate('/billing/new')}
          className="group w-full rounded-full bg-os-accent hover:bg-os-accent-dark text-white pl-8 pr-4 sm:pl-14 sm:pr-5 py-5 sm:py-6 flex items-center justify-between gap-4 text-left transition-colors"
        >
          <span className="min-w-0">
            <span className="block font-display text-[2.75rem] sm:text-[4.5rem] leading-[0.9]">{t('New bill')}</span>
            <span className="block text-base sm:text-lg text-white/80 mt-2">{t('Add items, take payment, print the bill.')}</span>
          </span>
          <span className="h-16 w-16 sm:h-24 sm:w-24 rounded-full bg-white text-os-accent flex items-center justify-center shrink-0 transition-transform group-hover:translate-x-1">
            <ArrowRight size={34} />
          </span>
        </button>
      )}

      <section>
        <h2 className="font-display text-[1.75rem] sm:text-[2rem] mb-4">{t('Today')}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stat(
            <>
              <Store size={15} /> {t('Shop sales')}
            </>,
            formatINR(todaySales)
          )}
          {stat(t('Shop bills'), todayBills.length)}
          {stat(t('Average bill'), formatINR(averageBill))}
          {stat(
            <>
              <Globe size={15} /> {t('Online store')}
            </>,
            t('Coming soon'),
            true
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {tiles
          .filter((tile) => can(tile.perm))
          .map((tile) => (
            <button
              key={tile.path}
              onClick={() => navigate(tile.path)}
              className="group card p-5 sm:p-6 text-left hover:bg-os-ink hover:text-white transition-colors flex flex-col gap-6 min-h-[10.5rem]"
            >
              <span className="text-os-ink group-hover:text-white transition-colors">{tile.icon}</span>
              <span className="mt-auto">
                <span className="block text-lg sm:text-xl font-semibold leading-snug">{tile.title}</span>
                <span className="block text-sm sm:text-[0.9375rem] text-os-muted group-hover:text-white/70 transition-colors mt-0.5">{tile.text}</span>
                {tile.badge && (
                  <span className="inline-block mt-3 px-2.5 py-0.5 rounded-full text-[0.8125rem] font-semibold bg-status-amberBg text-status-amber">
                    {tile.badge}
                  </span>
                )}
              </span>
            </button>
          ))}
      </section>

      {can('BILLS') && orders.length > 0 && (
        <section>
          <div className="flex items-end justify-between gap-3 mb-4">
            <h2 className="font-display text-[1.75rem] sm:text-[2rem]">{t('Latest bills')}</h2>
            <button
              onClick={() => navigate('/bills')}
              className="h-9 px-4 rounded-full text-[0.9375rem] font-semibold ring-1 ring-inset ring-os-line hover:ring-os-ink flex items-center gap-1.5"
            >
              {t('All bills')} <ArrowRight size={16} />
            </button>
          </div>
          <div className="card divide-y divide-os-line">
            {orders.slice(0, 5).map((bill) => (
              <button
                key={bill.id}
                onClick={() => navigate(`/bills/${bill.id}`)}
                className="w-full text-left px-5 sm:px-6 py-4 hover:bg-os-soft flex items-center justify-between gap-3 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block text-base font-semibold">
                    {bill.orderNumber}
                    {bill.billStatus === 'VOID' && <span className="ml-2 text-sm text-status-red">{t('Cancelled')}</span>}
                  </span>
                  <span className="block text-sm text-os-muted truncate">
                    {bill.createdAt.substring(11, 16)} · {bill.customerName === 'Walk-in Customer' ? t('Walk-in customer') : bill.customerName} ·{' '}
                    {t(paymentWord(bill))}
                  </span>
                </span>
                <span className="font-display text-[1.5rem] leading-none whitespace-nowrap">{formatINR(bill.grandTotal)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
