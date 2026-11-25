import { useSyncExternalStore } from 'react';
import { growFrom, pageSwap } from '../utils/pageSwap';

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

// Switching theme: a square-cornered panel in the new colours grows out of the
// swatch that was tapped until it covers the screen (see utils/pageSwap).
export function setTheme(next: Theme, from?: HTMLElement | null) {
  if (next === theme) return;
  if (!from) {
    commitTheme(next);
    return;
  }
  pageSwap(() => commitTheme(next), growFrom(from), { duration: 460, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' });
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
