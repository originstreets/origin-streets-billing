import { supabase } from '../lib/supabaseClient';
import { mapBillToOrder, settingsFromShop } from './pos';
import { CommerceSettings, Order } from '../types';
import { DbInvoiceTemplate, DbPosBill, DbPosBillItem, DbPosCustomer, DbPosPaymentTransaction } from '../types/supabase';

// One bill for the page its QR code opens (/bill/<id>). Anyone with the
// printed bill can open it without signing in, so it goes through the
// pos_public_bill database function (db/migrations/0006_public_bill.sql),
// which returns only that bill and only what the printed bill shows.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PublicBillRow {
  bill: Omit<DbPosBill, 'notes' | 'staff_id' | 'pos_customer_id'>;
  items: Omit<DbPosBillItem, 'variant_id'>[];
  payments: DbPosPaymentTransaction[];
  customer: Pick<DbPosCustomer, 'name' | 'phone' | 'email'> | null;
  shop: DbInvoiceTemplate;
}

export async function fetchPublicBill(billId: string): Promise<{ bill: Order; settings: CommerceSettings } | null> {
  if (!UUID_RE.test(billId)) return null;
  const { data, error } = await supabase.rpc('pos_public_bill', { p_bill_id: billId });
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as PublicBillRow;
  const bill: DbPosBill = { ...row.bill, notes: null, staff_id: null, pos_customer_id: null };
  const items: DbPosBillItem[] = row.items.map((i) => ({ ...i, variant_id: null }));
  const customer = row.customer
    ? ({ ...row.customer, address: null, city: null } as unknown as DbPosCustomer)
    : undefined;

  return {
    bill: mapBillToOrder(bill, items, customer, undefined, row.payments),
    settings: settingsFromShop(row.shop || {}, null),
  };
}
