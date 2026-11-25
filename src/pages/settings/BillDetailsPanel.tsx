import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Save } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { store, useStore } from '../../services/store';
import { fetchInvoiceTemplate } from '../../api/shop';
import { billTextFromShop } from '../../api/pos';
import { DbInvoiceTemplate } from '../../types/supabase';
import { CommerceSettings } from '../../types';
import { isValidGstin, normalizeGstin } from '../../utils/gstin';
import { useT } from '../../i18n';
import { BillPreview } from './BillPreview';

// Everything printed on a bill, in one place, with the bill drawn live next
// to it: the shop's details, every line of text, what prints (logo, barcode,
// QR) and the bill number series. A text line left empty is not printed.

type TextField =
  | 'company_name'
  | 'tagline'
  | 'address_line1'
  | 'address_line2'
  | 'city'
  | 'state'
  | 'pincode'
  | 'phone'
  | 'email'
  | 'gstin'
  | 'thank_you_note'
  | 'footer_note'
  | 'qr_label'
  | 'invoice_title'
  | 'signatory_label'
  | 'computer_note'
  | 'terms';

type Form = Record<TextField, string> & { show_logo: boolean; show_qr: boolean; show_barcode: boolean };

const SERIES_RE = /^[A-Z0-9]{2,8}$/;

function formFrom(tpl: DbInvoiceTemplate): Form {
  const text = billTextFromShop(tpl);
  return {
    company_name: tpl.company_name || '',
    tagline: tpl.tagline || '',
    address_line1: tpl.address_line1 || '',
    address_line2: tpl.address_line2 || '',
    city: tpl.city || '',
    state: tpl.state || '',
    pincode: tpl.pincode || '',
    phone: tpl.phone || '',
    email: tpl.email || '',
    gstin: tpl.gstin || '',
    // Lines show what prints today (their default when never changed).
    thank_you_note: text.thankYou,
    footer_note: tpl.footer_note || '',
    qr_label: text.qrLabel,
    invoice_title: text.invoiceTitle,
    signatory_label: text.signatory,
    computer_note: text.computerNote,
    terms: tpl.terms || '',
    show_logo: text.showLogo,
    show_qr: text.showQr,
    show_barcode: text.showBarcode,
  };
}

export const BillDetailsPanel: React.FC = () => {
  const { settings } = useStore();
  const t = useT();
  const [form, setForm] = useState<Form | null>(null);
  const [series, setSeries] = useState(settings.invoicePrefix);
  const [lowStock, setLowStock] = useState(String(settings.lowStockThreshold));
  const [previewKind, setPreviewKind] = useState<'slip' | 'a4'>('slip');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Loaded fresh from the database, so nothing saved on another till is lost.
  useEffect(() => {
    let cancelled = false;
    fetchInvoiceTemplate()
      .then((tpl) => !cancelled && setForm(formFrom(tpl)))
      .catch((err: unknown) => !cancelled && setLoadError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  // The bill as it would print with what is typed right now.
  const draft: CommerceSettings | null = useMemo(() => {
    if (!form) return null;
    const tpl: DbInvoiceTemplate = { ...form, gstin: form.gstin.trim() ? normalizeGstin(form.gstin) : '' };
    return {
      ...settings,
      storeName: form.company_name || 'Origin',
      brand: form.company_name || 'Origin',
      tagline: form.tagline,
      address: [form.address_line1, form.address_line2].filter((x) => x.trim()).join(', '),
      cityState: [form.city, form.state, form.pincode].filter((x) => x.trim()).join(', '),
      state: form.state,
      phone: form.phone,
      email: form.email,
      gstin: tpl.gstin || '',
      terms: form.terms,
      footer: form.footer_note,
      bill: billTextFromShop(tpl),
      invoicePrefix: SERIES_RE.test(series) ? series : settings.invoicePrefix,
    };
  }, [form, series, settings]);

  if (loadError) {
    return <div className="p-4 border border-status-redBorder bg-status-redBg text-status-red text-base font-bold">{loadError}</div>;
  }
  if (!form || !draft) return <div className="text-base text-os-muted">{t('Loading…')}</div>;

  const set = (k: TextField) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const toggle = (k: 'show_logo' | 'show_qr' | 'show_barcode') => setForm({ ...form, [k]: !form[k] });
  const gstinBad = form.gstin.trim() !== '' && !isValidGstin(form.gstin);
  const seriesBad = !SERIES_RE.test(series);

  const handleSave = async () => {
    const low = Number(lowStock);
    const problems: string[] = [];
    if (!form.company_name.trim() || !form.state.trim()) problems.push(t('Shop name and State are needed (State decides CGST + SGST or IGST).'));
    if (gstinBad) problems.push(t('This GSTIN does not look right. It has 15 letters and numbers.'));
    if (seriesBad) problems.push(t('The bill series is 2 to 8 capital letters or numbers, for example ORS.'));
    if (!Number.isInteger(low) || low < 0) problems.push(t('Low stock must be a whole number, 0 or more.'));
    if (problems.length > 0) {
      store.addToast(t('Check the details'), problems.join(' '), 'error');
      return;
    }
    setSaving(true);
    try {
      await store.saveBillDetails(
        { ...form, gstin: form.gstin.trim() ? normalizeGstin(form.gstin) : '' },
        { invoicePrefix: series, lowStockThreshold: low }
      );
    } catch (err) {
      store.addToast(t('Bill details not saved'), err instanceof Error ? err.message : undefined, 'error');
    } finally {
      setSaving(false);
    }
  };

  const section = (title: string, text: string | null, children: React.ReactNode) => (
    <fieldset className="space-y-4">
      <legend className="w-full pb-3 mb-1 border-b border-os-line">
        <span className="block font-display text-2xl">{title}</span>
        {text && <span className="block text-sm text-os-muted mt-0.5">{text}</span>}
      </legend>
      {children}
    </fieldset>
  );

  const area = (k: TextField, label: string, helper?: string) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`bill-${k}`} className="label">
        {label}
      </label>
      <textarea id={`bill-${k}`} className="field min-h-[4.5rem]" value={form[k]} onChange={set(k)} maxLength={1000} />
      {helper && <span className="text-sm text-os-muted">{helper}</span>}
    </div>
  );

  const switchRow = (k: 'show_logo' | 'show_qr' | 'show_barcode', label: string, helper: string) => (
    <label className="flex items-start justify-between gap-4 py-3 cursor-pointer">
      <span>
        <span className="block text-base font-semibold">{label}</span>
        <span className="block text-sm text-os-muted">{helper}</span>
      </span>
      <input type="checkbox" role="switch" checked={form[k]} onChange={() => toggle(k)} className="os-switch shrink-0 mt-0.5" />
    </label>
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-8">
      <div className="space-y-9 min-w-0">
        <p className="text-base text-os-muted">{t('Everything here prints on every bill. The bill on the right changes as you type.')}</p>

        {!form.gstin.trim() && (
          <div className="flex gap-3 p-4 bg-status-amberBg text-status-amber text-base font-bold">
            <AlertTriangle size={22} className="shrink-0" />
            {t('GSTIN is not filled in yet. Add it here before giving GST bills.')}
          </div>
        )}

        {section(
          t('Shop'),
          null,
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label={`${t('Shop name')} *`} value={form.company_name} onChange={set('company_name')} maxLength={80} />
              <Input label={t('Line under the name')} value={form.tagline} onChange={set('tagline')} maxLength={80} />
            </div>
            <Input label={t('Address line 1')} value={form.address_line1} onChange={set('address_line1')} maxLength={120} />
            <Input label={t('Address line 2')} value={form.address_line2} onChange={set('address_line2')} maxLength={120} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label={t('City')} value={form.city} onChange={set('city')} maxLength={60} />
              <Input label={`${t('State')} *`} value={form.state} onChange={set('state')} maxLength={60} />
              <Input label={t('PIN code')} value={form.pincode} onChange={set('pincode')} inputMode="numeric" maxLength={6} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label={t('Phone')} value={form.phone} onChange={set('phone')} inputMode="tel" maxLength={30} />
              <Input label={t('Email')} type="email" value={form.email} onChange={set('email')} maxLength={120} />
            </div>
            <Input
              label="GSTIN"
              value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
              maxLength={15}
              autoCapitalize="characters"
              spellCheck={false}
              error={gstinBad ? t('This GSTIN does not look right. It has 15 letters and numbers.') : undefined}
            />
          </>
        )}

        {section(
          t('Lines on the bill'),
          t('Leave a line empty to leave it off the bill.'),
          <>
            <Input label={t('Thank-you line')} value={form.thank_you_note} onChange={set('thank_you_note')} maxLength={120} />
            <Input
              label={t('Bill bottom line')}
              value={form.footer_note}
              onChange={set('footer_note')}
              maxLength={160}
              helperText={t('For example: opening hours or exchange policy.')}
            />
            <Input label={t('Words under the QR code')} value={form.qr_label} onChange={set('qr_label')} maxLength={60} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label={t('A4 invoice title')} value={form.invoice_title} onChange={set('invoice_title')} maxLength={40} />
              <Input label={t('Under the signature line')} value={form.signatory_label} onChange={set('signatory_label')} maxLength={60} />
            </div>
            <Input label={t('Note on the A4 invoice')} value={form.computer_note} onChange={set('computer_note')} maxLength={120} />
            {area('terms', t('Terms on the A4 invoice (optional)'))}
          </>
        )}

        {section(
          t('On the bill'),
          null,
          <div className="divide-y divide-os-line">
            {switchRow('show_logo', t('Origin logo at the top'), t('Off: the shop name is printed in letters instead.'))}
            {switchRow('show_barcode', t('Barcode of the bill number'), t('For finding the bill with a barcode scanner.'))}
            {switchRow('show_qr', t('QR code'), t('Customers scan it to see this bill on their phone.'))}
          </div>
        )}

        {section(
          t('Bill numbers'),
          t('Each series counts on its own and starts at 0001. Bills already made keep their numbers.'),
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <Input
              label={t('Series')}
              value={series}
              onChange={(e) => setSeries(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              maxLength={8}
              autoCapitalize="characters"
              spellCheck={false}
              error={seriesBad ? t('The bill series is 2 to 8 capital letters or numbers, for example ORS.') : undefined}
            />
            <div className="pt-7 text-base">
              {t('Next bill')}: <b className="tabular-nums">{draft.invoicePrefix}-YYMM-0001</b>
            </div>
          </div>
        )}

        {section(
          t('Stock warnings'),
          null,
          <Input
            label={t('Low stock at (pieces)')}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={lowStock}
            onChange={(e) => setLowStock(e.target.value)}
            helperText={t('A colour and size with this many pieces or fewer shows as low stock.')}
          />
        )}

        <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-os-paper flex justify-end">
          <Button variant="primary" icon={<Save size={18} />} onClick={handleSave} disabled={saving}>
            {saving ? t('Saving…') : t('Save bill details')}
          </Button>
        </div>
      </div>

      <section className="xl:sticky xl:top-6 self-start space-y-3" aria-label={t('Bill preview')}>
        <div className="flex items-center justify-between gap-3">
          <span className="font-display text-2xl">{t('Preview')}</span>
          <div role="tablist" className="seg">
            {(['slip', 'a4'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={previewKind === k}
                onClick={() => setPreviewKind(k)}
                className="seg-item"
              >
                {k === 'slip' ? t('80 mm bill') : t('A4 invoice')}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-os-soft p-4">
          <BillPreview settings={draft} kind={previewKind} />
        </div>
        <p className="text-sm text-os-muted">{t('Sample bill. Your real bills use their own items and totals.')}</p>
      </section>
    </div>
  );
};
