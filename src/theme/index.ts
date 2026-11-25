import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

// Origin's two colour themes. Only the accent changes (menu, top line,
// "New bill" button, tabs, icons); text, lines and printed bills stay black
// on white. index.html applies the saved theme before the first paint; this
// keeps it in sync afterwards. The choice is remembered on this device.
//   mono  black & white
//   red   red (#FF0000) & white
export type Theme = 'mono' | 'red';

const STORAGE_KEY = 'origin-billing-theme';
// Browser top-bar colour on phones, per theme.
const THEME_COLOR: Record<Theme, string> = { mono: '#0F0F0F', red: '#FF0000' };

function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'red' ? 'red' : 'mono';
  } catch {
    return 'mono';
  }
}

let theme: Theme = readStoredTheme();
const listeners = new Set<() => void>();

function applyDocumentTheme() {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}
applyDocumentTheme();

export function getTheme(): Theme {
  return theme;
}

function commitTheme(next: Theme) {
  theme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private window or blocked storage: the switch still works until reload.
  }
  applyDocumentTheme();
  listeners.forEach((l) => l());
}

type ViewTransitionLike = { ready: Promise<void>; finished: Promise<void> };
type StartViewTransition = (update: () => void) => ViewTransitionLike;

// Switching theme: a square-cornered panel in the new colours grows out of the
// swatch that was tapped until it covers the screen (the browser's own page
// transition, so it stays smooth). Browsers without it, and anyone who has
// asked for less motion, get the plain instant switch.
export function setTheme(next: Theme, from?: HTMLElement | null) {
  if (next === theme) return;
  const start = (document as unknown as { startViewTransition?: StartViewTransition }).startViewTransition;
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!from || typeof start !== 'function' || reduce) {
    commitTheme(next);
    return;
  }

  const r = from.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2);
  const y = Math.round(r.top + r.height / 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const root = document.documentElement;
  root.classList.add('theme-swap');
  const done = () => root.classList.remove('theme-swap');

  const vt = start.call(document, () => flushSync(() => commitTheme(next)));
  vt.ready
    .then(() => {
      root.animate(
        { clipPath: [`inset(${y}px ${w - x}px ${h - y}px ${x}px)`, 'inset(0px 0px 0px 0px)'] },
        { duration: 460, easing: 'cubic-bezier(0.25, 1, 0.5, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    })
    .catch(done);
  vt.finished.then(done, done);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders the component when the theme changes. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, getTheme);
}
