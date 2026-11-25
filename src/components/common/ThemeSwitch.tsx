import React from 'react';
import { clsx } from 'clsx';
import { Theme, setTheme, useTheme } from '../../theme';
import { useT } from '../../i18n';

// Two square swatches side by side: black (black & white theme) and red (red &
// white theme). The one in use sits in a filled square. tone 'dark' is for
// the black rail. The choice is remembered on this device.
const OPTIONS: { value: Theme; swatch: string; label: string }[] = [
  { value: 'mono', swatch: 'bg-black ring-1 ring-white/60', label: 'Black & white' },
  { value: 'red', swatch: 'bg-[#FF0000] ring-1 ring-white/60', label: 'Red & white' },
];

export const ThemeSwitch: React.FC<{ className?: string; tone?: 'light' | 'dark' }> = ({ className, tone = 'light' }) => {
  const theme = useTheme();
  const t = useT();
  const dark = tone === 'dark';

  return (
    <div
      role="group"
      aria-label={t('Colour theme')}
      className={clsx('h-11 p-1 flex shrink-0 gap-1', dark ? 'bg-white/10' : 'bg-os-panel', className)}
    >
      {OPTIONS.map((o) => {
        const on = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={(e) => setTheme(o.value, e.currentTarget)}
            aria-pressed={on}
            aria-label={t(o.label)}
            title={t(o.label)}
            className={clsx(
              'h-9 w-9 flex items-center justify-center transition-colors',
              on ? (dark ? 'bg-white' : 'bg-os-paper shadow-subtle') : dark ? 'hover:bg-white/10' : 'hover:bg-os-soft'
            )}
          >
            <span className={clsx('w-5 h-5', o.swatch, !on && 'opacity-70')} />
          </button>
        );
      })}
    </div>
  );
};
