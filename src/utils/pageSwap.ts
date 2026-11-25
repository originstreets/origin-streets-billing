import { flushSync } from 'react-dom';

// Whole-page swaps (colour theme, language) drawn with the browser's own page
// transition: the old screen is held as a picture, the new one is drawn over
// it through a growing clip, so nothing on the page re-lays out mid-animation.
// Browsers without it, and anyone who has asked for less motion, get the
// plain instant switch.

type ViewTransitionLike = { ready: Promise<void>; finished: Promise<void> };
type StartViewTransition = (update: () => void | Promise<void>) => ViewTransitionLike;

export function pageSwap(
  update: () => void,
  clip: (w: number, h: number) => string[],
  timing: { duration: number; easing?: string }
) {
  const start = (document as unknown as { startViewTransition?: StartViewTransition }).startViewTransition;
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof start !== 'function' || reduce) {
    update();
    return;
  }

  const root = document.documentElement;
  root.classList.add('page-swap');
  const done = () => root.classList.remove('page-swap');
  const w = window.innerWidth;
  const h = window.innerHeight;

  const vt = start.call(document, async () => {
    flushSync(update);
    // Telugu letters may need their font: give it a moment so the new screen
    // is captured with the right letters, never the fallback.
    void document.body.offsetHeight;
    await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 250))]);
  });
  vt.ready
    .then(() => {
      root.animate({ clipPath: clip(w, h) }, { ...timing, pseudoElement: '::view-transition-new(root)' });
    })
    .catch(done);
  vt.finished.then(done, done);
}

/** Colour theme: a square-cornered panel grows out of the tapped swatch. */
export function growFrom(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2);
  const y = Math.round(r.top + r.height / 2);
  return (w: number, h: number) => [`inset(${y}px ${w - x}px ${h - y}px ${x}px)`, 'inset(0px 0px 0px 0px)'];
}

/**
 * Language: the new words are written in line by line - bands sweep left to
 * right, each starting just after the one above, like text being typed.
 */
export function writeInLines(rows = 8, frames = 24) {
  const stagger = 0.07;
  const span = 1 - (rows - 1) * stagger;
  const ease = (p: number) => 1 - Math.pow(1 - p, 3);
  return (w: number, h: number) => {
    const out: string[] = [];
    for (let f = 0; f <= frames; f++) {
      const t = f / frames;
      const pts = ['0px 0px'];
      for (let i = 0; i < rows; i++) {
        const p = ease(Math.min(1, Math.max(0, (t - i * stagger) / span)));
        const x = Math.round(p * w);
        pts.push(`${x}px ${Math.round((i * h) / rows)}px`, `${x}px ${Math.round(((i + 1) * h) / rows)}px`);
      }
      pts.push(`0px ${h}px`);
      out.push(`polygon(${pts.join(', ')})`);
    }
    return out;
  };
}
