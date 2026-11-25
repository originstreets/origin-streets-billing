import React, { useRef, useState } from 'react';
import { Check, Pipette } from 'lucide-react';
import { clsx } from 'clsx';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useT } from '../../i18n';
import { QUICK_COLOURS, hexToHsv, hexToRgb, hsvToHex, isLight, nearestColourName, rgbToHex } from '../../utils/colours';

export interface PickedColour {
  name: string;
  hex: string;
}

// A small square swatch shown next to a colour name everywhere.
export const ColourDot: React.FC<{ hex?: string | null; size?: number; className?: string }> = ({ hex, size = 14, className }) => {
  if (!hex) return null;
  return (
    <span
      aria-hidden="true"
      className={clsx('inline-block shrink-0', isLight(hex) && 'ring-1 ring-inset ring-black/20', className)}
      style={{ width: size, height: size, backgroundColor: hex }}
    />
  );
};

// Drag inside an element; reports the pointer as 0-1 across and down.
function useDrag(onMove: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const report = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    onMove(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
  };
  return {
    ref,
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      report(e);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) report(e);
    },
  };
}

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

// "Add colour": pick in the square (lightness) and on the bar (colour), or
// type R G B, or tap a common colour. The name fills in from the closest
// clothing colour and can be changed; Select adds it.
export const ColourPicker: React.FC<{
  taken: string[];
  onSelect: (colour: PickedColour) => void;
  onClose: () => void;
}> = ({ taken, onSelect, onClose }) => {
  const t = useT();
  const [hsv, setHsv] = useState(() => hexToHsv('#E63946'));
  const [name, setName] = useState(() => nearestColourName('#E63946'));
  const [nameTyped, setNameTyped] = useState(false);
  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const [r, g, b] = hexToRgb(hex);

  // The name follows the colour until the person types their own.
  const setColour = (next: { h: number; s: number; v: number }) => {
    setHsv(next);
    if (!nameTyped) setName(nearestColourName(hsvToHex(next.h, next.s, next.v)));
  };

  const square = useDrag((x, y) => setColour({ h: hsv.h, s: x, v: 1 - y }));
  const bar = useDrag((x) => setColour({ ...hsv, h: Math.min(359.9, x * 360) }));

  const setChannel = (i: 0 | 1 | 2, value: string) => {
    const n = Math.max(0, Math.min(255, Number(value) || 0));
    const rgb: [number, number, number] = [r, g, b];
    rgb[i] = n;
    const next = hexToHsv(rgbToHex(...rgb));
    // Keep the colour bar where it was when the colour turns grey.
    setColour(next.s === 0 ? { ...next, h: hsv.h } : next);
  };

  const EyeDropper = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
  const cleanName = name.trim().replace(/\s+/g, ' ');
  const duplicate = taken.some((c) => c.toLowerCase() === cleanName.toLowerCase());

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('Add colour')}
      maxWidth="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" icon={<Check size={18} />} disabled={!cleanName || duplicate} onClick={() => onSelect({ name: cleanName, hex })}>
            {t('Select')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Square: across = how strong the colour is, down = how dark */}
        <div
          {...square}
          className="relative w-full h-48 cursor-crosshair touch-none select-none"
          style={{
            backgroundColor: hsvToHex(hsv.h, 1, 1),
            backgroundImage: 'linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0))',
          }}
          role="img"
          aria-label={t('Colour')}
        >
          <span
            aria-hidden="true"
            className="absolute w-4 h-4 -ml-2 -mt-2 ring-2 ring-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)] pointer-events-none"
            style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: hex }}
          />
        </div>

        <div className="flex items-center gap-3">
          {EyeDropper && (
            <button
              type="button"
              aria-label={t('Pick a colour from the screen')}
              title={t('Pick a colour from the screen')}
              onClick={async () => {
                try {
                  const { sRGBHex } = await new EyeDropper().open();
                  setColour(hexToHsv(sRGBHex.toUpperCase()));
                } catch {
                  // closed without picking
                }
              }}
              className="h-10 w-10 flex items-center justify-center text-os-ink hover:bg-os-soft shrink-0"
            >
              <Pipette size={18} />
            </button>
          )}
          <span
            className={clsx('w-10 h-10 shrink-0', isLight(hex) && 'ring-1 ring-inset ring-black/20')}
            style={{ backgroundColor: hex }}
            aria-hidden="true"
          />
          {/* Bar: which colour */}
          <div
            {...bar}
            className="relative flex-1 h-4 cursor-pointer touch-none select-none"
            style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
            role="slider"
            aria-label={t('Colour')}
            aria-valuemin={0}
            aria-valuemax={360}
            aria-valuenow={Math.round(hsv.h)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') setColour({ ...hsv, h: Math.min(359.9, hsv.h + 5) });
              if (e.key === 'ArrowLeft') setColour({ ...hsv, h: Math.max(0, hsv.h - 5) });
            }}
          >
            <span
              aria-hidden="true"
              className="absolute top-1/2 w-3 h-6 -ml-1.5 -translate-y-1/2 bg-white ring-1 ring-black/40 pointer-events-none"
              style={{ left: `${(hsv.h / 360) * 100}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(['R', 'G', 'B'] as const).map((label, i) => (
            <label key={label} className="flex flex-col items-center gap-1">
              <input
                type="number"
                min={0}
                max={255}
                inputMode="numeric"
                value={[r, g, b][i]}
                onChange={(e) => setChannel(i as 0 | 1 | 2, e.target.value)}
                className="field h-11 text-center tabular-nums"
                aria-label={label}
              />
              <span className="text-sm font-semibold">{label}</span>
            </label>
          ))}
        </div>

        <label className="block">
          <span className="label mb-1.5">{t('Colour name')}</span>
          <input
            className="field h-12"
            value={name}
            maxLength={40}
            onChange={(e) => {
              setName(e.target.value);
              setNameTyped(true);
            }}
          />
          {duplicate && <span className="block mt-1 text-sm font-semibold text-status-red">{t('This colour is already on the product.')}</span>}
        </label>

        <div>
          <span className="label mb-2">{t('Common colours')}</span>
          <div className="grid grid-cols-8 gap-1.5">
            {QUICK_COLOURS.map((c) => (
              <button
                key={c.name}
                type="button"
                title={c.name}
                aria-label={c.name}
                aria-pressed={c.hex === hex}
                onClick={() => {
                  setHsv(hexToHsv(c.hex));
                  setName(c.name);
                  setNameTyped(false);
                }}
                className={clsx('aspect-square', isLight(c.hex) && 'ring-1 ring-inset ring-black/20', c.hex === hex && 'ring-2 ring-offset-2 ring-os-accent')}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
};
