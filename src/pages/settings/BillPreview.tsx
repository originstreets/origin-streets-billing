import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CommerceSettings, Order } from '../../types';
import { receiptDataFor } from '../../utils/printBill';
import { taxInvoiceHtml, thermalReceiptHtml } from '../../utils/receiptPrinter';
import { toIstDateTime } from '../../utils/formatters';

// A sample bill drawn with the very same HTML that is printed, so what is
// typed in Bill details shows exactly as it will come out of the printer.

const A4_WIDTH = 860;
const SLIP_WIDTH = 320;

function sampleBill(prefix: string): Order {
  const now = new Date();
  const period = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const items = [
    { productId: 'sample-1', variantId: 'sample-1', name: 'Box Logo Tee', variantName: 'M / Black', size: 'M', color: 'Black', quantity: 2, unitPrice: 1099, total: 2198 },
    { productId: 'sample-2', variantId: 'sample-2', name: 'Baggy Fit Jeans', variantName: '32 / Indigo', size: '32', color: 'Indigo', quantity: 1, unitPrice: 2499, total: 2499 },
  ];
  const subtotal = 4697;
  const discount = 200;
  const taxAmount = Math.round((subtotal - discount) * 0.18);
  return {
    id: '00000000-0000-4000-8000-000000000000',
    orderNumber: `${prefix || 'ORS'}-${period}-0001`,
    customerId: 'guest',
    customerName: 'Walk-in Customer',
    customerEmail: '',
    customerPhone: '',
    shippingAddress: { street: '', city: '', state: '', pincode: '', country: 'India' },
    items,
    subtotal,
    discount,
    shippingFee: 0,
    taxAmount,
    taxRate: 18,
    grandTotal: subtotal - discount + taxAmount,
    paymentStatus: 'PAID',
    fulfillmentStatus: 'DELIVERED',
    paymentMethod: 'UPI',
    paymentSplits: [{ id: 'sample', method: 'UPI', amount: subtotal - discount + taxAmount }],
    channel: 'OFFLINE',
    createdAt: toIstDateTime(now),
    timeline: [],
  };
}

export const BillPreview: React.FC<{ settings: CommerceSettings; kind: 'slip' | 'a4' }> = ({ settings, kind }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [width, setWidth] = useState(360);
  const [height, setHeight] = useState(600);

  const html = useMemo(() => {
    const data = receiptDataFor(sampleBill(settings.invoicePrefix), settings);
    return kind === 'a4' ? taxInvoiceHtml(data) : thermalReceiptHtml(data);
  }, [settings, kind]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const docWidth = kind === 'a4' ? A4_WIDTH : SLIP_WIDTH;
  const scale = Math.min(1, width / docWidth);

  const fit = () => {
    const doc = frameRef.current?.contentDocument;
    if (doc?.documentElement) setHeight(doc.documentElement.scrollHeight + 4);
  };

  return (
    <div ref={wrapRef} className="w-full bg-white">
      <div style={{ height: height * scale, overflow: 'hidden' }} className="mx-auto" aria-hidden="true">
        <iframe
          ref={frameRef}
          title="Bill preview"
          srcDoc={html}
          onLoad={fit}
          scrolling="no"
          tabIndex={-1}
          style={{
            border: 0,
            display: 'block',
            width: docWidth,
            height,
            transform: scale < 1 ? `scale(${scale})` : undefined,
            transformOrigin: 'top left',
            margin: scale < 1 ? 0 : '0 auto',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
};
