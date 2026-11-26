import React, { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Check, RefreshCw, Printer, Save, X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useT } from '../../i18n';
import { formatINR } from '../../utils/formatters';
import { textQrSvg } from '../../utils/billQr';
import { UpiAccount, lastUpiId, rememberUpi, upiPayLink } from '../../api/upi';

// Billing counter -> UPI. The cashier picks which of the shop's UPI IDs the
// bill is paid to; the app draws a QR with the amount already filled in. The
// customer scans it, and the cashier taps Paid once the money is in (the bill
// is saved) or Not paid (back to the bill to choose another way).
export const UpiPayModal: React.FC<{
  amount: number;
  payeeName: string;
  accounts: UpiAccount[] | null;
  print: boolean;
  busy: boolean;
  canManage: boolean;
  onPaid: (upiId: string | null) => void;
  onNotPaid: () => void;
  onManage: () => void;
}> = ({ amount, payeeName, accounts, print, busy, canManage, onPaid, onNotPaid, onManage }) => {
  const t = useT();
  const [pickedId, setPickedId] = useState<string>('');

  const list = accounts || [];
  const picked = list.find((a) => a.id === pickedId) || list.find((a) => a.id === lastUpiId()) || list[0] || null;

  const qr = useMemo(() => (picked ? textQrSvg(upiPayLink(picked.upiId, payeeName, amount), 300) : ''), [picked, payeeName, amount]);

  const paid = () => {
    if (picked) rememberUpi(picked.id);
    onPaid(picked ? picked.upiId : null);
  };

  return (
    <Modal
      isOpen
      onClose={busy ? () => undefined : onNotPaid}
      title={t('Pay by UPI')}
      subtitle={t('Pick the UPI ID, let the customer scan, then tap Paid.')}
      maxWidth="4xl"
      footer={
        <div className="grid grid-cols-2 gap-2 w-full">
          <button
            type="button"
            onClick={onNotPaid}
            disabled={busy}
            className="h-14 bg-os-paper ring-1 ring-inset ring-os-line hover:ring-os-accent text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <X size={18} />
            {t('Not paid')}
          </button>
          <button
            type="button"
            onClick={paid}
            disabled={busy}
            className="h-14 bg-os-accent text-white hover:bg-os-accent-dark text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {busy ? <RefreshCw size={18} className="animate-spin" /> : print ? <Printer size={18} /> : <Save size={18} />}
            {busy ? t('Saving…') : print ? t('Paid · Save & print bill') : t('Paid · Save bill')}
          </button>
        </div>
      }
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Which UPI ID */}
        <div className="space-y-2 min-w-0">
          <div className="label">{t('Pay to')}</div>
          {accounts === null ? (
            <div className="p-4 bg-os-panel text-base text-os-muted">{t('Loading UPI IDs…')}</div>
          ) : list.length === 0 ? (
            <div className="p-4 bg-os-panel space-y-3">
              <p className="text-base">{t('No UPI IDs added yet.')}</p>
              {canManage && (
                <button type="button" onClick={onManage} className="text-base font-semibold underline">
                  {t('Add them in Settings → UPI')}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2 max-h-[48vh] overflow-y-auto">
              {list.map((a) => {
                const on = picked?.id === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setPickedId(a.id)}
                    aria-pressed={on}
                    className={clsx(
                      'w-full p-3.5 flex items-center gap-3 text-left transition-colors',
                      on ? 'bg-os-paper ring-2 ring-inset ring-os-accent' : 'bg-os-panel hover:bg-os-soft'
                    )}
                  >
                    <span
                      className={clsx('w-6 h-6 shrink-0 flex items-center justify-center', on ? 'bg-os-accent text-white' : 'ring-1 ring-inset ring-os-line bg-os-paper')}
                    >
                      {on && <Check size={16} strokeWidth={3} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-base font-semibold truncate">{a.name || a.upiId}</span>
                      {a.name && <span className="block text-sm text-os-muted truncate">{a.upiId}</span>}
                      {a.description && <span className="block text-sm text-os-muted truncate">{a.description}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* What the customer scans */}
        <div className="bg-os-panel p-5 flex flex-col items-center text-center gap-3">
          <div className="text-sm text-os-muted">{t('Amount to pay')}</div>
          <div className="font-display text-5xl leading-none">{formatINR(amount)}</div>
          {picked && qr ? (
            <>
              <div className="bg-white p-3 ring-1 ring-inset ring-os-line">
                <div className="w-[260px] max-w-full [&>svg]:w-full [&>svg]:h-auto" dangerouslySetInnerHTML={{ __html: qr }} />
              </div>
              <div className="text-base font-semibold break-all">{picked.upiId}</div>
              <div className="text-sm text-os-muted max-w-xs">{t('Scan with any UPI app. The amount is already filled in.')}</div>
            </>
          ) : (
            <div className="py-10 text-base text-os-muted">{t('Check the payment in your UPI app, then tap Paid.')}</div>
          )}
        </div>
      </div>
    </Modal>
  );
};
