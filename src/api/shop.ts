import { supabase } from '../lib/supabaseClient';
import { DbInvoiceTemplate } from '../types/supabase';

// The shop's details printed on every bill (name, address, phone, GSTIN,
// bottom line, terms). Kept in settings key 'invoice' and changed in
// Settings -> Shop details. Nothing is made up: a field that has not been
// filled in stays blank on the bill.

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
    // Trimmed; an emptied field is removed rather than saved as "".
    const text = typeof v === 'string' ? v.trim() : v;
    if (text === '' || text === null) delete value[k];
    else (value as Record<string, unknown>)[k] = text;
  });
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'invoice', value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}
