import QRCode from 'qrcode';

// The QR code on every bill opens that bill as a web page - the same
// document that was printed (same layout, CSS and fonts), at
//   <app address>/bill/<bill id>?k=slip   80 mm bill
//   <app address>/bill/<bill id>?k=a4     A4 GST invoice
// The page needs internet on the phone that scans it. The app address is
// VITE_PUBLIC_APP_URL when set, otherwise wherever the app is running when
// the bill is printed.
export type BillPrintKind = 'slip' | 'a4';

export function publicAppUrl(): string {
  const configured = ((import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) || '').trim().replace(/\/+$/, '');
  return configured || window.location.origin;
}

export function billPageUrl(billId: string, kind: BillPrintKind): string {
  return `${publicAppUrl()}/bill/${encodeURIComponent(billId)}?k=${kind}`;
}

// QR as inline SVG markup (synchronous, so it drops straight into the
// printed bill's HTML). Error correction M: a short link leaves room for it,
// so a slightly smudged thermal print still scans.
function qrSvg(text: string, sizePx: number, level: 'L' | 'M'): string | null {
  const qr = QRCode.create(text, { errorCorrectionLevel: level });
  if (qr.version > 20) return null; // beyond this, thermal-printed modules get too small to scan
  const n = qr.modules.size;
  const quiet = 2;
  let path = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules.get(x, y)) path += `M${x + quiet},${y + quiet}h1v1h-1z`;
    }
  }
  const dim = n + quiet * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="#ffffff"/><path d="${path}" fill="#000000"/></svg>`;
}

export function billLinkQrSvg(url: string, sizePx: number): string {
  try {
    return qrSvg(url, sizePx, 'M') || '';
  } catch {
    return '';
  }
}

// Without a bill id (the printer's test print) the QR carries the bill as
// plain text instead. ASCII only ("Rs" not the rupee sign) keeps it small
// enough to scan off an 80mm thermal slip.
export interface BillQrInput {
  orderNumber: string;
  createdAt: string;
  customerName: string;
  customerPhone?: string;
  items: Array<{ name: string; size?: string; color?: string; variantName?: string; quantity: number; unitPrice: number; total: number }>;
  subtotal: number;
  discount: number;
  taxAmount: number;
  taxRate?: number;
  grandTotal: number;
  paymentSplits?: Array<{ method: string; amount: number }>;
  storeName?: string;
  gstin?: string;
}

function amt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function rate(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '');
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.substring(0, max - 1)}~` : s;
}

export function billQrText(b: BillQrInput, maxItems = b.items.length): string {
  const taxRate = b.taxRate ?? 0;
  const taxable = b.subtotal - b.discount;
  const cgst = Math.round((b.taxAmount / 2) * 100) / 100;
  const sgst = Math.round((b.taxAmount - cgst) * 100) / 100;

  const lines: string[] = [
    `${b.storeName || 'Origin'} - TAX INVOICE`,
    ...(b.gstin ? [`GSTIN ${b.gstin}`] : []),
    `Bill ${b.orderNumber}`,
    `Date ${b.createdAt}`,
    `Customer ${b.customerName}${b.customerPhone ? ` ${b.customerPhone}` : ''}`,
    '--',
  ];

  b.items.slice(0, maxItems).forEach((i, idx) => {
    const variant = i.variantName || [i.size, i.color].filter(Boolean).join('/');
    lines.push(
      `${idx + 1}. ${clip(i.name, 22)}${variant ? ` (${clip(variant, 10)})` : ''} ${i.quantity}x${amt(i.unitPrice)}=${amt(i.total)}`
    );
  });
  if (maxItems < b.items.length) lines.push(`+${b.items.length - maxItems} more item(s) - see printed bill`);

  lines.push('--', `Subtotal Rs${amt(b.subtotal)}`);
  if (b.discount > 0) lines.push(`Discount -Rs${amt(b.discount)}`);
  lines.push(
    `Taxable Rs${amt(taxable)}`,
    `CGST ${rate(taxRate / 2)}% Rs${amt(cgst)}`,
    `SGST ${rate(taxRate / 2)}% Rs${amt(sgst)}`,
    `TOTAL Rs${amt(b.grandTotal)}`
  );

  // Only real tender splits - a bill reloaded from the database doesn't carry
  // its payment method on the Order, so nothing is guessed here.
  if (b.paymentSplits && b.paymentSplits.length > 0) {
    lines.push(`Paid ${b.paymentSplits.map((p) => `${p.method} Rs${amt(p.amount)}`).join(', ')}`);
  }

  return lines.join('\n');
}

// Text QR. A very long bill that won't fit a scannable QR drops items from
// the tail and says so, never the totals.
export function billQrSvg(b: BillQrInput, sizePx: number): string {
  for (let maxItems = b.items.length; maxItems >= 0; maxItems--) {
    try {
      const svg = qrSvg(billQrText(b, maxItems), sizePx, 'L');
      if (svg) return svg;
    } catch {
      // Too much data for any QR version - try with fewer items.
    }
  }
  return '';
}
