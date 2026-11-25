/** @type {import('tailwindcss').Config} */
// Origin look: white paper, flat grey panels, a side rail in the theme colour.
// Anybody (condensed, heavy) for titles and big numbers, Instrument Sans for
// everything else (Telugu letters fall back to Noto Sans Telugu). Everything
// is square. Two colour themes, never mixed - only the accent changes:
//   mono  black & white   accent (rail, buttons, chosen items) = black
//   red   red & white     accent (rail, buttons, chosen items) = #FF0000
// The values live in CSS variables (src/index.css), switched by
// <html data-theme="...">, so `bg-os-accent`, `text-os-ink/60` etc. follow
// the theme everywhere.
const token = (name) => `rgb(var(--os-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        os: {
          ink: token('ink'),
          paper: token('paper'),
          page: token('page'),
          panel: token('panel'),
          soft: token('soft'),
          line: token('line'),
          muted: token('muted'),
          accent: token('accent'),
          'accent-dark': token('accent-dark'),
          // The active item and the main button on the black rail.
          highlight: token('highlight'),
          'on-highlight': token('on-highlight'),
        },
        status: {
          green: '#15803D',
          greenBg: '#F0FDF4',
          greenBorder: '#BBF7D0',
          amber: '#B45309',
          amberBg: '#FFFBEB',
          amberBorder: '#FDE68A',
          red: '#B91C1C',
          redBg: '#FEF2F2',
          redBorder: '#FECACA',
          blue: '#1D4ED8',
          blueBg: '#EFF6FF',
          blueBorder: '#BFDBFE',
        },
      },
      fontFamily: {
        display: ['Anybody', "'Noto Sans Telugu'", "'Arial Narrow'", 'system-ui', 'sans-serif'],
        sans: ["'Instrument Sans'", "'Noto Sans Telugu'", 'system-ui', 'sans-serif'],
        mono: ["'Instrument Sans'", "'Noto Sans Telugu'", 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        float: '0 12px 32px -12px rgba(0, 0, 0, 0.35)',
        modal: '0 24px 60px -20px rgba(0, 0, 0, 0.45)',
      },
    },
  },
  plugins: [],
};
