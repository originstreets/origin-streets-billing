import React from 'react';
import { clsx } from 'clsx';
import { Theme, setTheme, useTheme } from '../../theme';
import { useT } from '../../i18n';

// Two small squares, like the language switch: a black one (black & white
// theme) and a red one (red & white theme). The one in use has a thick
// frame and a white tick mark. Same height as the other top-bar buttons.
const OPTIONS: { value: Theme; swatch: string; label: string }[] = [
  { value: 'mono', swatch: 'bg-[#0F0F0F]', label: 'Black & white' },
  { value: 'red', swatch: 'bg-[#FF0000]', label: 'Red & white' },
];

export const ThemeSwitch: React.FC<{ className?: string }> = ({ className }) => {
  const theme = useTheme();
  const t = useT();

  return (
    <div role="group" aria-label={t('Colour theme')} className={clsx('h-11 flex shrink-0 border border-os-line bg-os-paper', className)}>
      {OPTIONS.map((o, i) => {
        const on = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => setTheme(o.value)}
            aria-pressed={on}
            aria-label={t(o.label)}
            title={t(o.label)}
            className={clsx(
              'h-full w-11 flex items-center justify-center transition-colors',
              i > 0 && 'border-l border-os-line',
              on ? 'bg-os-soft' : 'hover:bg-os-soft'
            )}
          >
            <span
              className={clsx(
                'w-6 h-6 flex items-center justify-center',
                o.swatch,
                on ? 'ring-2 ring-offset-2 ring-os-ink' : 'opacity-70'
              )}
            >
              {on && <span className="w-2 h-2 bg-white" />}
            </span>
          </button>
        );
      })}
    </div>
  );
};
