// Row shapes of the Origin Supabase tables this app reads or writes.
// Stock never changes by writing a table: it moves only through the pos_*
// database functions, which also write the stock history.

export interface DbProduct {
  id: string;
  slug: string;
  name: string;
  category_id: string | null;
  // The product's price; each colour x size starts at it and can differ.
  price: number | null;
  compare_at: number | null;
  images: string[];
  // Worked out by the database from the variants - never written.
  sizes: string[];
  stock: number;
  description: string | null;
  material: string | null;
  care: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbCategory {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

// The standard sizes of a category (Shirts: S, M, L, XL), in order.
export interface DbCategorySize {
  id: string;
  category_id: string;
  size: string;
  sort_order: number;
  created_at: string;
}

export interface DbProductVariant {
  id: string;
  product_id: string;
  size: string | null;
  color: string | null;
  color_hex: string | null;
  stock: number;
  price: number;
  compare_price: number | null;
  sku: string | null;
  created_at: string;
}

export interface DbPosStaff {
  id: string;
  user_id: string;
  display_name: string;
  role: 'OWNER' | 'MANAGER' | 'BILLING' | 'FULFILLMENT';
  is_active: boolean;
  permissions: string[];
  created_at: string;
}

export interface DbPosCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  city: string | null;
  linked_profile_id: string | null;
  gstin: string | null;
  orders_count: number;
  total_spend: number;
  created_at: string;
}

export interface DbPosSettings {
  id: string;
  tax_rate: number;
  tax_threshold: number;
  tax_rate_low: number;
  tax_rate_high: number;
  shipping_flat_rate: number;
  free_shipping_threshold: number;
  currency: string;
  invoice_prefix: string;
  printer_name: string | null;
  printer_connection: 'WIFI' | 'USB' | 'ETHERNET' | null;
  last_test_print: string | null;
  low_stock_threshold: number;
  updated_at: string;
}

// settings row key = 'invoice' (Settings -> Shop details): the shop's details
// printed on every bill. Every field is optional until it is filled in.
export interface DbInvoiceTemplate {
  company_name?: string;
  tagline?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  gstin?: string;
  logo_url?: string;
  footer_note?: string;
  terms?: string;
  tax_rate?: number | string;
  tax_label?: string;
  show_tax?: boolean;
  invoice_prefix?: string;
}

export interface DbPosBill {
  id: string;
  bill_number: string;
  pos_customer_id: string | null;
  staff_id: string | null;
  channel: 'OFFLINE';
  subtotal: number;
  discount: number;
  discount_reason: string | null;
  tax_amount: number;
  tax_rate: number;
  tax_is_custom: boolean;
  shipping_fee: number;
  grand_total: number;
  payment_status: 'PAID' | 'PENDING' | 'REFUNDED' | 'FAILED';
  status: 'COMPLETED' | 'VOID' | 'RETURNED';
  notes: string | null;
  customer_gstin: string | null;
  created_at: string;
}

export interface DbPosBillItem {
  id: string;
  bill_id: string;
  variant_id: string | null;
  product_id: string | null;
  product_slug: string;
  product_name: string;
  size: string | null;
  color: string | null;
  qty: number;
  unit_price: number;
  item_discount: number;
  line_total: number;
  created_at: string;
}

export interface DbPosPaymentTransaction {
  id: string;
  bill_id: string;
  method: 'CASH' | 'UPI' | 'CARD' | 'OTHER';
  amount: number;
  tendered: number | null;
  change_amount: number | null;
  status: 'SUCCESS' | 'REFUNDED' | 'PENDING';
  created_at: string;
}

export interface DbPosInventoryLog {
  id: string;
  variant_id: string | null;
  product_id: string | null;
  product_slug: string;
  change_qty: number;
  new_stock: number;
  reason: 'SALE' | 'RESTOCK' | 'ADJUSTMENT' | 'RETURN_RESTOCK' | 'DAMAGED' | 'VOID' | 'EDIT';
  bill_id: string | null;
  staff_id: string | null;
  note: string | null;
  created_at: string;
}

export interface DbPosReturn {
  id: string;
  return_number: string;
  bill_id: string;
  bill_item_id: string;
  qty: number;
  reason: string;
  condition: string | null;
  refund_amount: number;
  status: 'REQUESTED' | 'APPROVED' | 'REFUNDED' | 'REJECTED';
  staff_id: string | null;
  created_at: string;
}
