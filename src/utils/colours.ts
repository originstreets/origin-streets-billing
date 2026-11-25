// Clothing colours by name, for the colour wheel: the common ones are shown
// as quick picks, and any colour picked on the wheel gets the name of the
// closest one (the name can still be changed before it is added).

export interface NamedColour {
  name: string;
  hex: string;
}

export const CLOTHING_COLOURS: NamedColour[] = [
  { name: 'Black', hex: '#1C1C1C' },
  { name: 'Charcoal', hex: '#3A3B3F' },
  { name: 'Grey', hex: '#8C9096' },
  { name: 'Light Grey', hex: '#C9CBCF' },
  { name: 'White', hex: '#F6F6F3' },
  { name: 'Off White', hex: '#ECE6D8' },
  { name: 'Cream', hex: '#F1E6C8' },
  { name: 'Beige', hex: '#D8C3A0' },
  { name: 'Sand', hex: '#CDB892' },
  { name: 'Khaki', hex: '#A89A6A' },
  { name: 'Brown', hex: '#6C4A32' },
  { name: 'Chocolate', hex: '#4A3024' },
  { name: 'Tan', hex: '#B5835A' },
  { name: 'Mustard', hex: '#D4A017' },
  { name: 'Yellow', hex: '#F2D13D' },
  { name: 'Orange', hex: '#E8731C' },
  { name: 'Rust', hex: '#A8461F' },
  { name: 'Red', hex: '#D3241C' },
  { name: 'Maroon', hex: '#6B1E23' },
  { name: 'Wine', hex: '#5A1A32' },
  { name: 'Pink', hex: '#F0A3B5' },
  { name: 'Hot Pink', hex: '#E0457B' },
  { name: 'Lavender', hex: '#B9A7D6' },
  { name: 'Purple', hex: '#5E3A87' },
  { name: 'Navy', hex: '#1F2A44' },
  { name: 'Indigo', hex: '#2D3A5C' },
  { name: 'Royal Blue', hex: '#2A4BB0' },
  { name: 'Blue', hex: '#3C6FC4' },
  { name: 'Sky Blue', hex: '#A8C4E6' },
  { name: 'Washed Blue', hex: '#7D9BC0' },
  { name: 'Teal', hex: '#1F6F72' },
  { name: 'Mint', hex: '#A8DCC5' },
  { name: 'Green', hex: '#2F7D45' },
  { name: 'Bottle Green', hex: '#1E4A33' },
  { name: 'Olive', hex: '#6A7045' },
  { name: 'Sage', hex: '#9CAF88' },
];

// Shown as quick picks under the wheel.
export const QUICK_COLOURS = ['Black', 'White', 'Off White', 'Grey', 'Navy', 'Indigo', 'Sky Blue', 'Red', 'Maroon', 'Olive', 'Sand', 'Brown', 'Green', 'Mustard', 'Pink', 'Lavender'].map(
  (name) => CLOTHING_COLOURS.find((c) => c.name === name)!
);

export const HEX_RE = /^#[0-9A-F]{6}$/i;

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

// h 0-360, s and v 0-1
export function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const [r, g, b] = hexToRgb(hex).map((x) => x / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s: max ? d / max : 0, v: max };
}

// Closest named clothing colour (weighted RGB distance, close to how eyes see it).
export function nearestColourName(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  let best = CLOTHING_COLOURS[0];
  let bestD = Infinity;
  for (const c of CLOTHING_COLOURS) {
    const [r2, g2, b2] = hexToRgb(c.hex);
    const rm = (r + r2) / 2;
    const d = (2 + rm / 256) * (r - r2) ** 2 + 4 * (g - g2) ** 2 + (2 + (255 - rm) / 256) * (b - b2) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best.name;
}

// A swatch needs a thin edge when it is very light (white on white).
export function isLight(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 215;
}
