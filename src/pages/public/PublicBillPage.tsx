import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { fetchPublicBill } from '../../api/publicBill';
import { receiptDataFor } from '../../utils/printBill';
import { taxInvoiceHtml, thermalReceiptHtml } from '../../utils/receiptPrinter';
import { CommerceSettings, Order } from '../../types';
import { BrandLogo } from '../../components/common/BrandLogo';

// What a customer sees after scanning the QR code on a bill: the bill itself,
// built from the very same HTML and CSS that was printed (utils/receiptPrinter),
// so the screen and the paper match. ?k=a4 shows the A4 GST invoice,
// anything else the 80 mm bill. No sign-in needed. Printed bills are in
// English, so this page is too.

const A4_WIDTH = 860; // matches the invoice's own viewport width

type State =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; bill: Order; settings: CommerceSettings };

export const PublicBillPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const kind = params.get('k') === 'a4' ? 'a4' : 'slip';
  const [state, setState] = useState<State>({ status: 'loading' });
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState(800);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    let cancelled = false;
    fetchPublicBill(id)
      .then((res) => {
        if (cancelled) return;
        setState(res ? { status: 'ready', ...res } : { status: 'missing' });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const html = useMemo(() => {
    if (state.status !== 'ready') return '';
    const data = receiptDataFor(state.bill, state.settings);
    return kind === 'a4' ? taxInvoiceHtml(data) : thermalReceiptHtml(data);
  }, [state, kind]);

  useEffect(() => {
    if (state.status === 'ready') document.title = `${state.bill.orderNumber} · ${state.settings.brand || 'Origin'}`;
  }, [state]);

  // The frame grows to the bill's full height, so the page scrolls as one.
  const fitFrame = () => {
    const doc = frameRef.current?.contentDocument;
    if (doc?.documentElement) setFrameHeight(doc.documentElement.scrollHeight + 8);
  };

  if (state.status !== 'ready') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-6 p-6 text-center text-[#0F0F0F]">
        <BrandLogo height={40} tone="black" />
        {state.status === 'loading' && <p className="text-base text-[#4D4D4D]">Loading the bill…</p>}
        {state.status === 'missing' && (
          <div className="space-y-2 max-w-sm">
            <p className="text-xl font-bold">Bill not found</p>
            <p className="text-base text-[#4D4D4D]">Please scan the QR code on the bill again, or ask the shop for a copy.</p>
          </div>
        )}
        {state.status === 'error' && (
          <div className="space-y-2 max-w-sm">
            <p className="text-xl font-bold">Could not load the bill</p>
            <p className="text-base text-[#4D4D4D]">Check the internet connection and try again.</p>
            <p className="text-sm text-[#4D4D4D] break-words">{state.message}</p>
          </div>
        )}
      </div>
    );
  }

  // The A4 invoice is shown whole, scaled down to the screen width (pinch to zoom).
  const scale = kind === 'a4' ? Math.min(1, viewportWidth / A4_WIDTH) : 1;
  const cancelled = state.bill.billStatus === 'VOID';

  return (
    <div className="min-h-screen bg-white">
      {cancelled && (
        <div role="alert" className="border-b-4 border-[#B91C1C] bg-[#FEF2F2] text-[#B91C1C] text-center font-bold text-base px-4 py-3">
          This bill was cancelled by the shop.
        </div>
      )}
      <div style={{ height: frameHeight * scale, overflow: 'hidden' }}>
        <iframe
          ref={frameRef}
          title={`Bill ${state.bill.orderNumber}`}
          srcDoc={html}
          onLoad={fitFrame}
          scrolling="no"
          style={{
            border: 0,
            display: 'block',
            width: kind === 'a4' ? A4_WIDTH : '100%',
            height: frameHeight,
            transform: scale < 1 ? `scale(${scale})` : undefined,
            transformOrigin: 'top left',
          }}
        />
      </div>
    </div>
  );
};
