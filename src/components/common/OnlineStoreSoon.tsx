import React from 'react';
import { Globe } from 'lucide-react';
import { clsx } from 'clsx';
import { useT } from '../../i18n';

// Origin has no online store yet. Wherever Vault 26 billing shows website
// orders, Origin shows this instead, so the place is ready for it.
export const OnlineStoreSoon: React.FC<{ className?: string; compact?: boolean }> = ({ className, compact }) => {
  const t = useT();
  if (compact) {
    return (
      <span className={clsx('inline-flex items-center gap-1.5 text-os-muted', className)}>
        <Globe size={16} /> {t('Online store')} · <b className="text-os-ink">{t('Coming soon')}</b>
      </span>
    );
  }
  return (
    <div className={clsx('flex items-start gap-3', className)}>
      <span className="p-2.5 bg-os-soft text-os-accent shrink-0">
        <Globe size={22} />
      </span>
      <div>
        <div className="text-lg font-bold">
          {t('Online store')} · <span className="text-os-accent">{t('Coming soon')}</span>
        </div>
        <p className="text-base text-os-muted">{t('Online orders will show here once the Origin online store opens.')}</p>
      </div>
    </div>
  );
};
