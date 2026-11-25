import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { clsx } from 'clsx';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useT } from '../../i18n';
import { HEX_RE, QUICK_COLOURS, hexToHsv, hsvToHex, isLight, nearestColourName } from '../../utils/colours';

export interface PickedColour {
  name: string;
  hex: string;
}

// A small round swatch shown next to a colour name everywhere.
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

const WHEEL = 248;

// Draws the hue (around) x saturation (out from the middle) wheel at one brightness.
function drawWheel(canvas: HTMLCanvasElement, value: number) {
  const ratio = window.devicePixelRatio || 1;
  const size = Math.round(WHEEL * ratio);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(size, size);
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - r;
      const dy = y - r;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = (y * size + x) * 4;
      if (dist > r) {
        img.data[i + 3] = 0;
        continue;
      }
      // HSV -> RGB in plain numbers (this runs for every pixel).
      const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
      const s = dist / r;
      const c = value * s;
      const hp = h / 60;
      const xx = c * (1 - Math.abs((hp % 2) - 1));
      const m = value - c;
      const [rr, gg, bb] =
        hp < 1 ? [c, xx, 0] : hp < 2 ? [xx, c, 0] : hp < 3 ? [0, c, xx] : hp < 4 ? [0, xx, c] : hp < 5 ? [xx, 0, c] : [c, 0, xx];
      img.data[i] = (rr + m) * 255;
      img.data[i + 1] = (gg + m) * 255;
      img.data[i + 2] = (bb + m) * 255;
      // soft edge
      img.data[i + 3] = dist > r - 1.5 ? Math.round(255 * (r - dist) / 1.5) : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// "Add colour": pick on the wheel (and brightness), or tap a common colour.
// The name fills in from the closest clothing colour and can be changed;
// Select adds it.
export const ColourPicker: React.FC<{
  taken: string[];
  onSelect: (colour: PickedColour) => void;
  onClose: () => void;
}> = ({ taken, onSelect, onClose }) => {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hsv, setHsv] = useState(() => hexToHsv('#1F2A44'));
  const [hexText, setHexText] = useState('#1F2A44');
  const [name, setName] = useState('Navy');
  const [nameTyped, setNameTyped] = useState(false);
  const dragging = useRef(false);

  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);

  useEffect(() => {
    if (canvasRef.current) drawWheel(canvasRef.current, hsv.v);
  }, [hsv.v]);

  // The name follows the colour until the person types their own.
  const applyHex = useCallback(
    (next: string, nextHsv?: { h: number; s: number; v: number }) => {
      setHsv(nextHsv || hexToHsv(next));
      setHexText(next);
      if (!nameTyped) setName(nearestColourName(next));
    },
    [nameTyped]
  );

  const pickAt = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const r = rect.width / 2;
    const dx = clientX - rect.left - r;
    const dy = clientY - rect.top - r;
    const s = Math.min(1, Math.sqrt(dx * dx + dy * dy) / r);
    const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    const next = { h, s, v: hsv.v };
    applyHex(hsvToHex(h, s, hsv.v), next);
  };

  const markerAngle = (hsv.h * Math.PI) / 180;
  const marker = {
    left: WHEEL / 2 + Math.cos(markerAngle) * hsv.s * (WHEEL / 2),
    top: WHEEL / 2 + Math.sin(markerAngle) * hsv.s * (WHEEL / 2),
  };

  const cleanName = name.trim().replace(/\s+/g, ' ');
  const duplicate = taken.some((c) => c.toLowerCase() === cleanName.toLowerCase());

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('Add colour')}
      maxWidth="2xl"
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
      <div className="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)] gap-6 items-start">
        <div className="flex flex-col items-center gap-4">
          <div
            className="relative touch-none select-none cursor-crosshair"
            style={{ width: WHEEL, height: WHEEL }}
            onPointerDown={(e) => {
              dragging.current = true;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              pickAt(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => dragging.current && pickAt(e.clientX, e.clientY)}
            onPointerUp={() => (dragging.current = false)}
            onPointerCancel={() => (dragging.current = false)}
          >
            <canvas ref={canvasRef} style={{ width: WHEEL, height: WHEEL }} className="" aria-label={t('Colour wheel')} role="img" />
            <span
              aria-hidden="true"
              className="absolute w-6 h-6 -ml-3 -mt-3 ring-[3px] ring-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)] pointer-events-none"
              style={{ left: marker.left, top: marker.top, backgroundColor: hex }}
            />
          </div>
          <label className="w-full max-w-[248px]">
            <span className="label mb-1.5">{t('Brightness')}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(hsv.v * 100)}
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                applyHex(hsvToHex(hsv.h, hsv.s, v), { ...hsv, v });
              }}
              className="w-full accent-black"
              style={{ background: `linear-gradient(to right, #000, ${hsvToHex(hsv.h, hsv.s, 1)})` }}
            />
          </label>
        </div>

        <div className="space-y-5 min-w-0">
          <div className="flex items-center gap-4">
            <span
              className={clsx('w-20 h-20 shrink-0', isLight(hex) && 'ring-1 ring-inset ring-black/15')}
              style={{ backgroundColor: hex }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 space-y-3">
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
              </label>
              <label className="block">
                <span className="label mb-1.5">{t('Colour code')}</span>
                <input
                  className="field h-11 uppercase tabular-nums"
                  value={hexText}
                  maxLength={7}
                  spellCheck={false}
                  onChange={(e) => {
                    const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
                    setHexText(v.toUpperCase());
                    if (HEX_RE.test(v)) applyHex(v.toUpperCase());
                  }}
                />
              </label>
            </div>
          </div>
          {duplicate && <p className="text-sm font-semibold text-status-red">{t('This colour is already on the product.')}</p>}

          <div>
            <span className="label mb-2">{t('Common colours')}</span>
            <div className="grid grid-cols-8 gap-2">
              {QUICK_COLOURS.map((c) => {
                const on = c.hex === hex;
                return (
                  <button
                    key={c.name}
                    type="button"
                    title={c.name}
                    aria-label={c.name}
                    aria-pressed={on}
                    onClick={() => {
                      setNameTyped(false);
                      setName(c.name);
                      setHsv(hexToHsv(c.hex));
                      setHexText(c.hex);
                    }}
                    className={clsx(
                      'aspect-square transition-transform hover:scale-110',
                      isLight(c.hex) && 'ring-1 ring-inset ring-black/20',
                      on && 'ring-2 ring-offset-2 ring-os-accent'
                    )}
                    style={{ backgroundColor: c.hex }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
