import React from 'react';
import { clsx } from 'clsx';
import { Lang, setLang, useLang } from '../../i18n';

// Two square letters side by side: A (English) | అ (Telugu). The language in use
// is filled; tap the other letter to switch. tone 'dark' is for the black
// rail. The choice is remembered on this device.
const OPTIONS: { value: Lang; letter: string; label: string }[] = [
  { value: 'en', letter: 'A', label: 'English' },
  { value: 'te', letter: 'అ', label: 'తెలుగు · Telugu' },
];

export const LanguageSwitch: React.FC<{ className?: string; tone?: 'light' | 'dark' }> = ({ className, tone = 'light' }) => {
  const lang = useLang();
  const dark = tone === 'dark';

  return (
    <div
      role="group"
      aria-label="Language / భాష"
      className={clsx('h-11 p-1 flex shrink-0 gap-1', dark ? 'ring-1 ring-inset ring-white' : 'bg-os-panel', className)}
    >
      {OPTIONS.map((o) => {
        const on = lang === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => setLang(o.value)}
            aria-pressed={on}
            aria-label={o.label}
            title={o.label}
            lang={o.value}
            className={clsx(
              'h-9 w-9 flex items-center justify-center font-semibold leading-none transition-colors',
              o.value === 'te' ? 'text-[19px] pt-0.5' : 'text-base',
              on
                ? dark
                  ? 'bg-white text-os-accent'
                  : 'bg-os-accent text-white'
                : dark
                  ? 'text-white hover:bg-white hover:text-os-accent'
                  : 'text-os-accent hover:bg-os-paper'
            )}
          >
            {o.letter}
          </button>
        );
      })}
    </div>
  );
};
