import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { store, useStore } from '../../services/store';
import { fetchInvoiceTemplate } from '../../api/shop';
import { DbInvoiceTemplate } from '../../types/supabase';
import { isValidGstin, normalizeGstin } from '../../utils/gstin';
import { useT } from '../../i18n';

// The shop's details printed on every bill and on the monthly GST report.
// Origin has no website admin, so they are changed here.
type Field = keyof Pick<
  DbInvoiceTemplate,
  'company_name' | 'tagline' | 'address_line1' | 'address_line2' | 'city' | 'state' | 'pincode' | 'phone' | 'email' | 'gstin' | 'footer_note' | 'terms'
>;

export const ShopDetailsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { settings } = useStore();
  const t = useT();
  const [form, setForm] = useState<Record<Field, string> | null>(null);
  const [lowStock, setLowStock] = useState(String(settings.lowStockThreshold));
  const [saving, setSaving] = useState(false);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Loaded once, fresh from the database, so nothing saved on another till is lost.
  useEffect(() => {
    fetchInvoiceTemplate()
      .then((tpl) =>
        setForm({
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
          footer_note: tpl.footer_note || '',
          terms: tpl.terms || '',
        })
      )
      .catch((err) => {
        store.addToast(t('Could not load shop details'), err instanceof Error ? err.message : undefined, 'error');
        closeRef.current();
      });
  }, [t]);

  if (!form) return null;

  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const gstinBad = form.gstin.trim() !== '' && !isValidGstin(form.gstin);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const low = Number(lowStock);
    if (!form.company_name.trim() || !form.state.trim()) {
      store.addToast(t('Check the details'), t('Shop name and State are needed (State decides CGST + SGST or IGST).'), 'error');
      return;
    }
    if (gstinBad) {
      store.addToast(t('Check the details'), t('This GSTIN does not look right. It has 15 letters and numbers.'), 'error');
      return;
    }
    if (!Number.isInteger(low) || low < 0) {
      store.addToast(t('Check the details'), t('Low stock must be a whole number, 0 or more.'), 'error');
      return;
    }
    setSaving(true);
    try {
      await store.saveShopDetails({ ...form, gstin: form.gstin.trim() ? normalizeGstin(form.gstin) : '' }, low);
      onClose();
    } catch (err) {
      store.addToast(t('Shop details not saved'), err instanceof Error ? err.message : undefined, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={t('Change shop details')} subtitle={t('Printed on every bill.')} maxWidth="2xl">
      <form onSubmit={handleSave} className="space-y-4">
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
        <Input label={t('Bill bottom line')} value={form.footer_note} onChange={set('footer_note')} maxLength={160} helperText={t('For example: opening hours or exchange policy.')} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="shop-terms" className="label">
            {t('Terms on the A4 invoice (optional)')}
          </label>
          <textarea id="shop-terms" className="field min-h-[4.5rem]" value={form.terms} onChange={set('terms')} maxLength={1000} />
        </div>
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
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? t('Saving…') : t('Save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
