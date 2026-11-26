import { useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabaseClient';

// The shop's UPI IDs (Settings -> UPI). On the billing counter the cashier
// picks one and the app draws a QR with that bill's amount filled in; the
// bill remembers which UPI ID it was paid to.
export interface UpiAccount {
  id: string;
  upiId: string;
  name: string;
  description: string;
  sortOrder: number;
}

export const UPI_ID_RE = /^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9.-]{2,64}$/;

type Row = { id: string; upi_id: string; name: string; description: string | null; sort_order: number };

export async function fetchUpiAccounts(): Promise<UpiAccount[]> {
  const { data, error } = await supabase
    .from('pos_upi_accounts')
    .select('id, upi_id, name, description, sort_order')
    .order('sort_order')
    .order('created_at');
  if (error) throw new Error(error.message);
  return ((data || []) as Row[]).map((r) => ({
    id: r.id,
    upiId: r.upi_id,
    name: r.name || '',
    description: r.description || '',
    sortOrder: r.sort_order,
  }));
}

export async function saveUpiAccount(input: { id?: string; upiId: string; name: string; description: string; sortOrder?: number }): Promise<void> {
  const row = {
    upi_id: input.upiId.trim(),
    name: input.name.trim(),
    description: input.description.trim() || null,
    ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
  };
  const { error } = input.id
    ? await supabase.from('pos_upi_accounts').update(row).eq('id', input.id)
    : await supabase.from('pos_upi_accounts').insert(row);
  if (error) throw new Error(error.message);
  await refreshUpiAccounts();
}

export async function deleteUpiAccount(account: UpiAccount): Promise<void> {
  const { error } = await supabase.from('pos_upi_accounts').delete().eq('id', account.id);
  if (error) throw new Error(error.message);
  await refreshUpiAccounts();
}

/** upi:// link any UPI app opens with the payee and, when given, the amount filled in. */
export function upiPayLink(upiId: string, payeeName: string, amount?: number): string {
  const q = new URLSearchParams({ pa: upiId, pn: payeeName });
  if (amount !== undefined) q.set('am', amount.toFixed(2));
  q.set('cu', 'INR');
  return `upi://pay?${q.toString().replace(/\+/g, '%20')}`;
}

// ---- shared list for the billing counter and Settings (loaded once, kept fresh after edits)
let cache: UpiAccount[] | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function refreshUpiAccounts(): Promise<void> {
  loading = fetchUpiAccounts()
    .then((list) => {
      cache = list;
      listeners.forEach((l) => l());
    })
    .catch(() => undefined)
    .finally(() => {
      loading = null;
    });
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (cache === null && !loading) void refreshUpiAccounts();
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => cache;

/** The shop's UPI IDs; null until the first load finishes. */
export function useUpiAccounts(): UpiAccount[] | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// Last UPI ID picked on this device, chosen first next time.
const LAST_KEY = 'origin-last-upi';
export function lastUpiId(): string {
  try {
    return localStorage.getItem(LAST_KEY) || '';
  } catch {
    return '';
  }
}
export function rememberUpi(id: string) {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    // Storage blocked: nothing to remember.
  }
}
