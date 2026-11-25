/** @type {import('tailwindcss').Config} */
// Origin look: black ink on white paper, square corners, Imbue headings and
// Lato text (Telugu letters fall back to Noto Sans Telugu). Two colour
// themes share every screen - only the accent changes:
//   mono  black & white   accent = black
//   red   red & white     accent = #FF0000
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
          soft: token('soft'),
          line: token('line'),
          muted: token('muted'),
          accent: token('accent'),
          'accent-dark': token('accent-dark'),
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
        display: ['Imbue', "'Bodoni Moda'", "'Noto Sans Telugu'", 'Georgia', 'serif'],
        sans: ['Lato', "'Noto Sans Telugu'", 'system-ui', 'sans-serif'],
        mono: ['Lato', "'Noto Sans Telugu'", 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        float: '0 8px 24px -8px rgba(15, 15, 15, 0.18)',
        modal: '0 16px 40px -12px rgba(15, 15, 15, 0.28)',
      },
    },
  },
  plugins: [],
};
