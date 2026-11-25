import React, { useMemo } from 'react';
import { billLinkQrSvg, billPageUrl } from '../../utils/billQr';
import { useT } from '../../i18n';

// The bill's QR code, as on the printed bill: scanning it opens this bill as
// a web page, looking exactly like the printed 80 mm bill. Sits alongside
// the bill-number barcode, which stays for counter scanners.
export const BillQr: React.FC<{ billId: string; size?: number }> = ({ billId, size = 170 }) => {
  const t = useT();
  const url = billPageUrl(billId, 'slip');
  const svg = useMemo(() => billLinkQrSvg(url, size), [url, size]);
  if (!svg) return null;
  return (
    <div className="flex flex-col items-center select-none">
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      <span className="text-sm text-os-muted mt-1">{t('Scan to see this bill')}</span>
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold underline mt-1 no-print">
        {t('Open the bill page')}
      </a>
    </div>
  );
};
