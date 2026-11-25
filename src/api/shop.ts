import { supabase } from '../lib/supabaseClient';
import { DbInvoiceTemplate } from '../types/supabase';

// Everything printed on a bill besides the bill itself: the shop's details
// (name, address, phone, GSTIN), its lines (thank-you, bottom line, terms,
// QR caption, invoice title, signature) and what prints (logo, QR, barcode).
// Kept in settings key 'invoice' and changed in Settings -> Bill details.
// Nothing is made up: a field that has not been filled in stays blank.

export async function fetchInvoiceTemplate(): Promise<DbInvoiceTemplate> {
  const { data, error } = await supabase.from('settings').select('value').eq('key', 'invoice').maybeSingle();
  if (error) throw new Error(error.message);
  return ((data?.value as DbInvoiceTemplate | null) || {}) as DbInvoiceTemplate;
}

export async function saveInvoiceTemplate(updates: DbInvoiceTemplate): Promise<void> {
  const current = await fetchInvoiceTemplate();
  const value: DbInvoiceTemplate = { ...current };
  (Object.keys(updates) as (keyof DbInvoiceTemplate)[]).forEach((k) => {
    const v = updates[k];
    if (v === undefined) return;
    // Trimmed. An emptied line is saved as "" so it stays off the bill
    // (a line never saved prints its default).
    (value as Record<string, unknown>)[k] = typeof v === 'string' ? v.trim() : v;
  });
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'invoice', value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}
