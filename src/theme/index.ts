import { useSyncExternalStore } from 'react';

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

export function setTheme(next: Theme) {
  if (next === theme) return;
  theme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private window or blocked storage: the switch still works until reload.
  }
  applyDocumentTheme();
  listeners.forEach((l) => l());
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
