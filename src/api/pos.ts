import { supabase } from '../lib/supabaseClient';
import { fetchAllRows } from './fetchAll';
import {
  Product,
  ProductVariant,
  Collection,
  Customer,
  StaffMember,
  Order,
  OrderItem,
  CommerceSettings,
  BillText,
  InventoryLog,
  PaymentTransaction,
  ReturnRequest,
  ReturnStatus,
} from '../types';
import { normalizeGstin } from '../utils/gstin';
import { tr } from '../i18n';
import type { StoreCategory } from '../services/store';
import { variantLabel } from '../utils/singleItem';
import { toIstDateTime } from '../utils/formatters';
import {
  DbProduct,
  DbProductVariant,
  DbCategory,
  DbCategorySize,
  DbPosCustomer,
  DbPosStaff,
  DbPosBill,
  DbPosBillItem,
  DbPosInventoryLog,
  DbPosPaymentTransaction,
  DbPosReturn,
  DbPosSettings,
  DbInvoiceTemplate,
} from '../types/supabase';
import { fetchInvoiceTemplate } from './shop';

// Every colour x size needs a code that is printed as a barcode on the price
// tag and found again when scanned. Without a typed SKU it is made from the
// row's id, so it never changes.
export function variantCode(v: Pick<DbProductVariant, 'id' | 'sku'>): string {
  return v.sku?.trim() || `ORS-${v.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function mapVariant(v: DbProductVariant): ProductVariant {
  return {
    id: v.id,
    sku: variantCode(v),
    color: v.color || '',
    colorHex: v.color_hex || undefined,
    imageUrl: v.image_url || undefined,
    size: v.size || '',
    price: v.price,
    compareAtPrice: v.compare_price ?? undefined,
    stock: v.stock,
    barcode: variantCode(v),
  };
}

function mapProduct(p: DbProduct, variants: DbProductVariant[], category: DbCategory | undefined): Product {
  // Only real colour x size rows are sellable; a product without any is
  // flagged instead of being sold against one overall stock number.
  const ownVariants = variants.filter((v) => v.product_id === p.id);
  // Colours in the order they were added; within a colour, sizes in the
  // product's size order (the category's order).
  const sizeOrder = new Map((p.sizes || []).map((sz, i) => [sz.toLowerCase(), i]));
  const colourOrder = new Map<string, string>();
  ownVariants.forEach((v) => {
    const key = (v.color || '').toLowerCase();
    const seen = colourOrder.get(key);
    if (!seen || v.created_at < seen) colourOrder.set(key, v.created_at);
  });
  const sortedVariants = [...ownVariants].sort(
    (x, y) =>
      (colourOrder.get((x.color || '').toLowerCase()) || '').localeCompare(colourOrder.get((y.color || '').toLowerCase()) || '') ||
      (x.color || '').localeCompare(y.color || '') ||
      (sizeOrder.get((x.size || '').toLowerCase()) ?? 999) - (sizeOrder.get((y.size || '').toLowerCase()) ?? 999)
  );
  const mappedVariants: ProductVariant[] = sortedVariants.map(mapVariant);
  const categoryName = category?.name.trim() || 'Uncategorised';
  const colors = Array.from(new Set(sortedVariants.map((v) => (v.color || '').trim()).filter(Boolean)));

  return {
    id: p.id,
    name: p.name,
    sku: p.slug,
    collection: categoryName,
    category: categoryName,
    categoryId: p.category_id || undefined,
    categories: [categoryName],
    // The product's price; when left blank, the lowest colour x size price.
    price: p.price ?? (ownVariants.length ? Math.min(...ownVariants.map((v) => v.price)) : 0),
    compareAtPrice: p.compare_at ?? undefined,
    sizes: p.sizes || [],
    colors,
    variants: mappedVariants,
    totalStock: ownVariants.reduce((s, v) => s + v.stock, 0),
    needsSizeCounts: ownVariants.length === 0,
    status: p.is_active ? 'ACTIVE' : 'ARCHIVED',
    image: (p.images || [])[0] || '',
    description: p.description || '',
    material: p.material || '',
    care: p.care || '',
    tags: [],
  };
}

export async function fetchProducts(): Promise<Product[]> {
  const [{ data: products, error: pErr }, { data: variants, error: vErr }, { data: categories, error: catErr }] =
    await Promise.all([
      fetchAllRows((from, to) =>
        supabase.from('products').select('*').order('created_at', { ascending: false }).order('id').range(from, to)
      ),
      fetchAllRows((from, to) => supabase.from('product_variants').select('*').order('id').range(from, to)),
      fetchAllRows((from, to) => supabase.from('categories').select('*').order('id').range(from, to)),
    ]);
  if (pErr) throw new Error(pErr.message);
  if (vErr) throw new Error(vErr.message);
  if (catErr) throw new Error(catErr.message);

  const categoryById = new Map(((categories || []) as DbCategory[]).map((c) => [c.id, c]));
  return ((products || []) as DbProduct[]).map((p) =>
    mapProduct(p, (variants || []) as DbProductVariant[], p.category_id ? categoryById.get(p.category_id) : undefined)
  );
}

// Categories with their standard sizes, in the shop's order.
export async function fetchCategories(): Promise<StoreCategory[]> {
  const [{ data: cats, error }, { data: sizes, error: sErr }] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order').order('name'),
    supabase.from('category_sizes').select('*').order('sort_order').order('created_at'),
  ]);
  if (error) throw new Error(error.message);
  if (sErr) throw new Error(sErr.message);
  const sizesByCategory = new Map<string, { id: string; size: string }[]>();
  ((sizes || []) as DbCategorySize[]).forEach((z) => {
    const list = sizesByCategory.get(z.category_id) || [];
    list.push({ id: z.id, size: z.size.trim() });
    sizesByCategory.set(z.category_id, list);
  });
  return ((cats || []) as DbCategory[]).map((c) => ({
    id: c.id,
    name: c.name.trim(),
    slug: c.slug,
    sortOrder: c.sort_order,
    sizes: sizesByCategory.get(c.id) || [],
  }));
}

// ---------------------------------------------------------------- categories, sizes, products
// Origin keeps its products here (no website admin). Stock is never written
// directly: new rows get their opening stock through the database, later
// changes go through adjustStock, and both land in the stock history.

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'category';

const isDuplicate = (message: string, key: string) => message.includes(key) || /duplicate key/i.test(message);

export async function createCategory(name: string, sortOrder: number): Promise<string> {
  const clean = name.trim();
  const { data, error } = await supabase
    .from('categories')
    .insert({ name: clean, slug: `${slugify(clean)}-${Date.now().toString(36)}`, sort_order: sortOrder })
    .select('id')
    .single();
  if (error) throw new Error(isDuplicate(error.message, 'categories_name_key') ? tr('This category is already there.') : error.message);
  return data.id as string;
}

export async function renameCategory(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('categories').update({ name: name.trim() }).eq('id', id);
  if (error) throw new Error(isDuplicate(error.message, 'categories_name_key') ? tr('This category is already there.') : error.message);
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) {
    throw new Error(/foreign key/i.test(error.message) ? tr('This category still has products. Move or delete them first.') : error.message);
  }
}

export async function addCategorySize(categoryId: string, size: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('category_sizes').insert({ category_id: categoryId, size: size.trim(), sort_order: sortOrder });
  if (error) throw new Error(isDuplicate(error.message, 'category_sizes_key') ? tr('This size is already in the list.') : error.message);
}

export async function deleteCategorySize(id: string): Promise<void> {
  const { error } = await supabase.from('category_sizes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// New order of a category's sizes (ids in the order they should show).
export async function reorderCategorySizes(ids: string[]): Promise<void> {
  const results = await Promise.all(ids.map((id, i) => supabase.from('category_sizes').update({ sort_order: i }).eq('id', id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
}

export interface NewVariantInput {
  color: string | null;
  // The colour picked on the colour wheel (sent as-is to the database).
  color_hex?: string | null;
  // The colour's own photo (optional).
  image_url?: string | null;
  size: string;
  price: number;
  stock: number;
}

export async function createProduct(input: {
  name: string;
  categoryId: string;
  price: number;
  imageUrl: string | null;
  description: string | null;
  variants: NewVariantInput[];
  staffId: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('pos_create_product', {
    p_product: {
      name: input.name,
      category_id: input.categoryId,
      price: input.price,
      image_url: input.imageUrl,
      description: input.description,
    },
    p_variants: input.variants,
    p_staff_id: input.staffId,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function addVariants(productId: string, variants: NewVariantInput[], staffId: string | null): Promise<void> {
  const { error } = await supabase.rpc('pos_add_variants', { p_product_id: productId, p_variants: variants, p_staff_id: staffId });
  if (error) throw new Error(error.message);
}

export async function updateProduct(
  id: string,
  updates: { name?: string; categoryId?: string; price?: number; imageUrl?: string | null; description?: string | null }
): Promise<void> {
  const payload: Record<string, unknown> = {
    name: updates.name?.trim(),
    category_id: updates.categoryId,
    price: updates.price,
    images: updates.imageUrl === undefined ? undefined : updates.imageUrl ? [updates.imageUrl] : [],
    description: updates.description === undefined ? undefined : updates.description?.trim() || null,
  };
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  const { error } = await supabase.from('products').update(payload).eq('id', id);
  if (error) throw new Error(error.message);
}

// Price of one colour x size (or of several at once).
export async function updateVariantPrices(variantIds: string[], price: number): Promise<void> {
  if (variantIds.length === 0) return;
  const { error } = await supabase.from('product_variants').update({ price }).in('id', variantIds);
  if (error) throw new Error(error.message);
}

// A colour's own photo, on every size of that colour (null removes it).
export async function setColourPhoto(productId: string, colour: string, imageUrl: string | null): Promise<void> {
  let q = supabase.from('product_variants').update({ image_url: imageUrl }).eq('product_id', productId);
  q = colour ? q.eq('color', colour) : q.is('color', null);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

// Only a colour x size with no pieces left can be removed (the database
// refuses otherwise). Bills keep their own copy of what was sold.
export async function deleteVariant(variantId: string): Promise<void> {
  const { data, error } = await supabase.from('product_variants').delete().eq('id', variantId).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error(tr('Only a colour and size with 0 pieces can be removed.'));
}

// Bills keep their own copy of what was sold, so they are not affected.
export async function deleteProduct(id: string): Promise<void> {
  const { data, error } = await supabase.from('products').delete().eq('id', id).select('id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error(tr('Product not deleted.'));
}

// Product photos: resized in the browser (long side 1200 px, JPEG) so they
// load fast on the billing screen, then stored in the public bucket.
const PHOTO_BUCKET = 'product-images';

async function shrinkPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b || file), 'image/jpeg', 0.85));
}

export async function uploadProductPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(tr('Choose a JPG, PNG or WEBP photo.'));
  const blob = await shrinkPhoto(file);
  const path = `products/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

function mapCustomer(c: DbPosCustomer): Customer {
  const avgOrder = c.orders_count > 0 ? Math.round(c.total_spend / c.orders_count) : 0;
  return {
    id: c.id,
    name: c.name,
    email: c.email || '',
    phone: c.phone,
    address: c.address || '',
    city: c.city || '',
    gstin: c.gstin || undefined,
    ordersCount: c.orders_count,
    totalSpend: c.total_spend,
    averageOrderValue: avgOrder,
    segment: c.total_spend > 40000 ? 'VIP' : c.orders_count > 0 ? 'ACTIVE' : 'NEW',
    createdAt: toIstDateTime(c.created_at).substring(0, 10),
  };
}

export async function fetchCustomers(): Promise<Customer[]> {
  const { data, error } = await fetchAllRows((from, to) =>
    supabase.from('pos_customers').select('*').order('created_at', { ascending: false }).order('id').range(from, to)
  );
  if (error) throw new Error(error.message);
  return ((data || []) as DbPosCustomer[]).map(mapCustomer);
}

export async function createCustomer(input: {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
}): Promise<Customer> {
  const { data, error } = await supabase
    .from('pos_customers')
    .insert({
      name: input.name,
      phone: input.phone,
      email: input.email || null,
      address: input.address || null,
      city: input.city || null,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return mapCustomer(data as DbPosCustomer);
}

export async function updateCustomer(
  id: string,
  updates: { name?: string; phone?: string; email?: string; address?: string; city?: string; gstin?: string }
): Promise<void> {
  const payload: Record<string, unknown> = {
    name: updates.name,
    phone: updates.phone,
    email: updates.email,
    address: updates.address,
    city: updates.city,
    // '' clears a saved GSTIN; undefined leaves it alone.
    gstin: updates.gstin === undefined ? undefined : updates.gstin ? normalizeGstin(updates.gstin) : null,
  };
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

  const { error } = await supabase.from('pos_customers').update(payload).eq('id', id);
  if (error) throw new Error(error.message);
}

function mapStaff(s: DbPosStaff): StaffMember {
  return {
    id: s.id,
    name: s.display_name,
    email: '',
    role: s.role,
    status: s.is_active ? 'ACTIVE' : 'OFFLINE',
    permissions: s.permissions || [],
  };
}

export async function fetchStaff(): Promise<StaffMember[]> {
  const { data, error } = await fetchAllRows((from, to) =>
    supabase.from('pos_staff').select('*').order('created_at', { ascending: true }).order('id').range(from, to)
  );
  if (error) throw new Error(error.message);
  return ((data || []) as DbPosStaff[]).map(mapStaff);
}

export async function createStaffAccount(input: {
  displayName: string;
  email: string;
  password: string;
  role: 'OWNER' | 'MANAGER' | 'BILLING' | 'FULFILLMENT';
  permissions: string[];
}): Promise<StaffMember> {
  // One database call makes the login (already confirmed), its access role
  // and the staff row together - see db/migrations/0005_staff_logins.sql.
  // (supabase.auth.signUp cannot be used: Supabase rejects sign-ups to the
  // made-up login domain as an invalid email address.)
  const { data, error } = await supabase.rpc('pos_create_staff_login', {
    p_login: input.email,
    p_password: input.password,
    p_display_name: input.displayName,
    p_role: input.role,
    p_permissions: input.permissions,
  });
  if (error) throw new Error(error.message);
  return mapStaff(data as DbPosStaff);
}

export async function updateStaffPermissions(
  staffId: string,
  updates: { role?: 'OWNER' | 'MANAGER' | 'BILLING' | 'FULFILLMENT'; permissions?: string[]; isActive?: boolean }
): Promise<void> {
  const payload: Record<string, unknown> = {
    role: updates.role,
    permissions: updates.permissions,
    is_active: updates.isActive,
  };
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

  const { error } = await supabase.from('pos_staff').update(payload).eq('id', staffId);
  if (error) throw new Error(error.message);
}

export function mapBillToOrder(
  bill: DbPosBill,
  items: DbPosBillItem[],
  customer: DbPosCustomer | undefined,
  staffName?: string,
  payments: DbPosPaymentTransaction[] = []
): Order {
  // How the bill was really paid (one method, or a split across several).
  const splits = payments.map((p) => ({
    id: p.id,
    method: p.method,
    amount: Number(p.amount) || 0,
    tendered: p.tendered ?? undefined,
    change: p.change_amount ?? undefined,
  }));
  const cash = splits.find((p) => p.method === 'CASH');
  const orderItems: OrderItem[] = items
    .filter((i) => i.bill_id === bill.id)
    .map((i) => ({
      id: i.id,
      productId: i.product_id || i.product_slug,
      variantId: i.variant_id || '',
      name: i.product_name,
      variantName: variantLabel(i.size, i.color),
      size: i.size || '',
      color: i.color || '',
      quantity: i.qty,
      unitPrice: i.unit_price,
      total: i.line_total,
      itemDiscount: i.item_discount || undefined,
    }));

  return {
    id: bill.id,
    orderNumber: bill.bill_number,
    customerId: bill.pos_customer_id || 'guest',
    customerName: customer?.name || 'Walk-in Customer',
    customerEmail: customer?.email || '',
    customerPhone: customer?.phone || '',
    customerGstin: bill.customer_gstin || undefined,
    // In-store sale: the customer's own address when they gave one.
    shippingAddress: {
      street: customer?.address || '',
      city: customer?.city || '',
      state: '',
      pincode: '',
      country: 'India',
    },
    items: orderItems,
    subtotal: bill.subtotal,
    discount: bill.discount,
    discountReason: bill.discount_reason || undefined,
    shippingFee: bill.shipping_fee,
    taxAmount: bill.tax_amount,
    taxRate: bill.tax_rate,
    taxIsCustom: bill.tax_is_custom,
    grandTotal: bill.grand_total,
    paymentStatus: bill.payment_status,
    fulfillmentStatus: 'DELIVERED',
    paymentMethod: splits.length > 1 ? 'SPLIT' : splits[0]?.method || 'CASH',
    paymentSplits: splits,
    tenderedAmount: cash?.tendered,
    changeAmount: cash?.change,
    channel: 'OFFLINE',
    createdAt: toIstDateTime(bill.created_at),
    timeline: [
      { status: 'ORDER PLACED', time: toIstDateTime(bill.created_at), note: 'Bill made in the shop' },
    ],
    notes: bill.notes || undefined,
    billStatus: bill.status,
    staffId: bill.staff_id || undefined,
    staffName,
  };
}

export async function fetchBills(): Promise<Order[]> {
  const [
    { data: bills, error: bErr },
    { data: items, error: iErr },
    { data: customers, error: cErr },
    { data: staffRows, error: sErr },
    { data: paymentRows, error: pErr },
  ] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase.from('pos_bills').select('*').order('created_at', { ascending: false }).order('id').range(from, to)
    ),
    fetchAllRows((from, to) => supabase.from('pos_bill_items').select('*').order('id').range(from, to)),
    fetchAllRows((from, to) => supabase.from('pos_customers').select('*').order('id').range(from, to)),
    fetchAllRows((from, to) => supabase.from('pos_staff').select('*').order('id').range(from, to)),
    fetchAllRows((from, to) => supabase.from('pos_payment_transactions').select('*').order('id').range(from, to)),
  ]);
  if (bErr) throw new Error(bErr.message);
  if (iErr) throw new Error(iErr.message);
  if (cErr) throw new Error(cErr.message);
  if (sErr) throw new Error(sErr.message);
  if (pErr) throw new Error(pErr.message);

  const paymentsByBill = new Map<string, DbPosPaymentTransaction[]>();
  for (const pay of (paymentRows || []) as DbPosPaymentTransaction[]) {
    const list = paymentsByBill.get(pay.bill_id);
    if (list) list.push(pay);
    else paymentsByBill.set(pay.bill_id, [pay]);
  }

  const customerById = new Map(((customers || []) as DbPosCustomer[]).map((c) => [c.id, c]));
  const staffNameById = new Map(((staffRows || []) as DbPosStaff[]).map((s) => [s.id, s.display_name]));
  // Group items by bill once — filtering every item for every bill gets slow with thousands of bills.
  const itemsByBill = new Map<string, DbPosBillItem[]>();
  for (const i of (items || []) as DbPosBillItem[]) {
    const list = itemsByBill.get(i.bill_id);
    if (list) list.push(i);
    else itemsByBill.set(i.bill_id, [i]);
  }
  return ((bills || []) as DbPosBill[]).map((b) =>
    mapBillToOrder(
      b,
      itemsByBill.get(b.id) ?? [],
      b.pos_customer_id ? customerById.get(b.pos_customer_id) : undefined,
      b.staff_id ? staffNameById.get(b.staff_id) : undefined,
      paymentsByBill.get(b.id) ?? []
    )
  );
}

export interface CheckoutItemInput {
  variantId: string | null;
  productId: string;
  productSlug: string;
  productName: string;
  size: string | null;
  color: string | null;
  qty: number;
  unitPrice: number;
  itemDiscount: number;
}

export interface CheckoutPaymentInput {
  method: 'CASH' | 'UPI' | 'CARD' | 'OTHER';
  amount: number;
  tendered: number | null;
  changeAmount: number | null;
}

export async function checkout(input: {
  items: CheckoutItemInput[];
  customerId: string | null;
  staffId: string | null;
  // Bill-level discount only; item discounts travel on each item.
  discount: number;
  discountReason: string | null;
  // null = GST slab computed by the database; a number = OWNER-only override %.
  customTaxRate: number | null;
  shippingFee: number;
  payments: CheckoutPaymentInput[];
  notes: string | null;
  // Only sent when "ADD CUSTOMER GST" is on; the database also saves it on
  // the registered customer.
  customerGstin: string | null;
}): Promise<Order> {
  const { data, error } = await supabase.rpc('pos_checkout', {
    p_items: input.items.map((i) => ({
      variant_id: i.variantId,
      product_id: i.productId,
      product_slug: i.productSlug,
      product_name: i.productName,
      size: i.size,
      color: i.color,
      qty: i.qty,
      unit_price: i.unitPrice,
      item_discount: i.itemDiscount,
    })),
    p_customer_id: input.customerId,
    p_staff_id: input.staffId,
    p_discount: input.discount,
    p_discount_reason: input.discountReason,
    p_custom_tax_rate: input.customTaxRate,
    p_shipping_fee: input.shippingFee,
    p_payments: input.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      tendered: p.tendered,
      change_amount: p.changeAmount,
    })),
    p_notes: input.notes,
    p_customer_gstin: input.customerGstin ? normalizeGstin(input.customerGstin) : null,
  });
  if (error) throw new Error(error.message);

  const bill = data as DbPosBill;
  const [{ data: items, error: iErr }, { data: pays }] = await Promise.all([
    supabase.from('pos_bill_items').select('*').eq('bill_id', bill.id),
    supabase.from('pos_payment_transactions').select('*').eq('bill_id', bill.id),
  ]);
  if (iErr) throw new Error(iErr.message);

  let customer: DbPosCustomer | undefined;
  if (bill.pos_customer_id) {
    const { data: c } = await supabase.from('pos_customers').select('*').eq('id', bill.pos_customer_id).single();
    customer = c as DbPosCustomer;
  }
  const staffName = await fetchStaffName(bill.staff_id);

  return mapBillToOrder(bill, (items || []) as DbPosBillItem[], customer, staffName, (pays || []) as DbPosPaymentTransaction[]);
}

async function fetchStaffName(staffId: string | null): Promise<string | undefined> {
  if (!staffId) return undefined;
  const { data } = await supabase.from('pos_staff').select('display_name').eq('id', staffId).maybeSingle();
  return data?.display_name || undefined;
}

async function fetchOrderByBillId(billId: string): Promise<Order> {
  const [{ data: bill, error: bErr }, { data: items, error: iErr }, { data: pays }] = await Promise.all([
    supabase.from('pos_bills').select('*').eq('id', billId).single(),
    supabase.from('pos_bill_items').select('*').eq('bill_id', billId),
    supabase.from('pos_payment_transactions').select('*').eq('bill_id', billId),
  ]);
  if (bErr) throw new Error(bErr.message);
  if (iErr) throw new Error(iErr.message);

  let customer: DbPosCustomer | undefined;
  if (bill.pos_customer_id) {
    const { data: c } = await supabase.from('pos_customers').select('*').eq('id', bill.pos_customer_id).single();
    customer = c as DbPosCustomer;
  }
  const staffName = await fetchStaffName(bill.staff_id);

  return mapBillToOrder(bill as DbPosBill, (items || []) as DbPosBillItem[], customer, staffName, (pays || []) as DbPosPaymentTransaction[]);
}

export async function voidBill(billId: string, staffId: string | null, reason: string): Promise<Order> {
  const { error } = await supabase.rpc('pos_void_bill', {
    p_bill_id: billId,
    p_staff_id: staffId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return fetchOrderByBillId(billId);
}

export async function editBill(input: {
  billId: string;
  items: CheckoutItemInput[];
  discount: number;
  discountReason: string | null;
  customTaxRate: number | null;
  shippingFee: number;
  notes: string | null;
  editorStaffId: string | null;
}): Promise<Order> {
  const { error } = await supabase.rpc('pos_edit_bill', {
    p_bill_id: input.billId,
    p_items: input.items.map((i) => ({
      variant_id: i.variantId,
      product_id: i.productId,
      product_slug: i.productSlug,
      product_name: i.productName,
      size: i.size,
      color: i.color,
      qty: i.qty,
      unit_price: i.unitPrice,
      item_discount: i.itemDiscount,
    })),
    p_discount: input.discount,
    p_discount_reason: input.discountReason,
    p_custom_tax_rate: input.customTaxRate,
    p_shipping_fee: input.shippingFee,
    p_notes: input.notes,
    p_editor_staff_id: input.editorStaffId,
  });
  if (error) throw new Error(error.message);
  return fetchOrderByBillId(input.billId);
}

export type StockReason = 'RESTOCK' | 'ADJUSTMENT' | 'RETURN_RESTOCK' | 'DAMAGED';

export async function adjustStock(
  variantId: string,
  changeQty: number,
  reason: StockReason,
  staffId: string | null
): Promise<void> {
  const { error } = await supabase.rpc('pos_adjust_stock', {
    p_variant_id: variantId,
    p_change_qty: changeQty,
    p_reason: reason,
    p_staff_id: staffId,
    p_note: null,
  });
  if (error) throw new Error(error.message);
}

export async function fetchInventoryLogs(): Promise<InventoryLog[]> {
  const { data, error } = await supabase
    .from('pos_inventory_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return ((data || []) as DbPosInventoryLog[]).map((l) => ({
    id: l.id,
    date: toIstDateTime(l.created_at),
    productId: l.product_id || l.product_slug,
    productName: l.product_slug,
    variantSku: l.variant_id || l.product_slug,
    changeQty: l.change_qty,
    newStock: l.new_stock,
    reason: l.reason,
    user: 'Origin billing',
  }));
}

// The printed bill's own lines. A line never saved prints its default; a
// line saved empty is left off.
export function billTextFromShop(tpl: DbInvoiceTemplate): BillText {
  const brand = tpl.company_name || 'Origin';
  return {
    thankYou: tpl.thank_you_note ?? `Thank you for shopping at ${brand}`,
    qrLabel: tpl.qr_label ?? 'Scan to see this bill',
    invoiceTitle: tpl.invoice_title ?? 'TAX INVOICE',
    signatory: tpl.signatory_label ?? 'Authorized Signatory',
    computerNote: tpl.computer_note ?? 'This is a computer-generated tax invoice.',
    showLogo: tpl.show_logo ?? true,
    showQr: tpl.show_qr ?? true,
    showBarcode: tpl.show_barcode ?? true,
  };
}

// Business identity comes from Settings -> Bill details (settings key
// 'invoice'). Nothing is made up: a field that is not filled in stays blank.
export function settingsFromShop(tpl: DbInvoiceTemplate, pos: DbPosSettings | null): CommerceSettings {
  return {
    storeName: tpl.company_name || 'Origin',
    brand: tpl.company_name || 'Origin',
    tagline: tpl.tagline || '',
    address: [tpl.address_line1, tpl.address_line2].filter(Boolean).join(', '),
    cityState: [tpl.city, tpl.state, tpl.pincode].filter(Boolean).join(', '),
    state: tpl.state || '',
    country: tpl.country || 'India',
    phone: tpl.phone || '',
    email: tpl.email || '',
    website: tpl.website || '',
    gstin: tpl.gstin || '',
    logoUrl: tpl.logo_url || '',
    terms: tpl.terms || '',
    footer: tpl.footer_note || '',
    bill: billTextFromShop(tpl),
    invoicePrefix: pos?.invoice_prefix || 'ORS',
    currency: pos?.currency || 'INR',
    taxRate: pos?.tax_rate || 0,
    taxThreshold: pos?.tax_threshold ?? 2599,
    taxRateLow: pos?.tax_rate_low ?? 5,
    taxRateHigh: pos?.tax_rate_high ?? 18,
    shippingFlatRate: pos?.shipping_flat_rate || 0,
    freeShippingThreshold: pos?.free_shipping_threshold || 0,
    lowStockThreshold: pos?.low_stock_threshold ?? 5,
    printer: {
      name: pos?.printer_name || '',
      status: pos?.last_test_print ? 'ONLINE' : 'OFFLINE',
      connection: pos?.printer_connection || 'USB',
      lastTestPrint: pos?.last_test_print || undefined,
    },
  };
}

export async function fetchSettings(): Promise<CommerceSettings> {
  const [{ data: posSettings }, tpl] = await Promise.all([
    supabase.from('pos_settings').select('*').limit(1).maybeSingle(),
    fetchInvoiceTemplate().catch((): DbInvoiceTemplate => ({})),
  ]);
  return settingsFromShop(tpl, posSettings as DbPosSettings | null);
}

export async function saveSettings(updates: {
  taxRate?: number;
  taxThreshold?: number;
  taxRateLow?: number;
  taxRateHigh?: number;
  shippingFlatRate?: number;
  freeShippingThreshold?: number;
  currency?: string;
  invoicePrefix?: string;
  printerName?: string;
  printerConnection?: 'WIFI' | 'USB' | 'ETHERNET';
  lowStockThreshold?: number;
}): Promise<void> {
  const { data: existing } = await supabase.from('pos_settings').select('id').limit(1).maybeSingle();
  const payload: Record<string, unknown> = {
    tax_rate: updates.taxRate,
    tax_threshold: updates.taxThreshold,
    tax_rate_low: updates.taxRateLow,
    tax_rate_high: updates.taxRateHigh,
    shipping_flat_rate: updates.shippingFlatRate,
    free_shipping_threshold: updates.freeShippingThreshold,
    currency: updates.currency,
    invoice_prefix: updates.invoicePrefix,
    printer_name: updates.printerName,
    printer_connection: updates.printerConnection,
    low_stock_threshold: updates.lowStockThreshold,
  };
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

  if (existing) {
    const { error } = await supabase.from('pos_settings').update(payload).eq('id', existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('pos_settings').insert(payload);
    if (error) throw new Error(error.message);
  }
}

export function deriveCollections(products: Product[], orders: Order[]): Collection[] {
  const byCategory = new Map<string, Product[]>();
  for (const p of products) {
    const list = byCategory.get(p.category) || [];
    list.push(p);
    byCategory.set(p.category, list);
  }

  return Array.from(byCategory.entries()).map(([category, categoryProducts]) => {
    const productIds = new Set(categoryProducts.map((p) => p.id));
    let revenue = 0;
    let unitsSold = 0;
    for (const order of orders) {
      for (const item of order.items) {
        if (productIds.has(item.productId)) {
          revenue += item.total;
          unitsSold += item.quantity;
        }
      }
    }

    return {
      id: category,
      name: category,
      code: category.replace(/[^A-Za-z0-9]/g, '').substring(0, 4).toUpperCase() || 'GEN',
      description: `${category} collection`,
      productCount: categoryProducts.length,
      revenue,
      unitsSold,
      status: categoryProducts.some((p) => p.status === 'ACTIVE') ? 'ACTIVE' : 'ARCHIVED',
    };
  });
}

function mapPaymentTransaction(
  t: {
    id: string;
    bill_id: string;
    method: string;
    amount: number;
    status: string;
    created_at: string;
  },
  bill: DbPosBill | undefined,
  customerName: string
): PaymentTransaction {
  return {
    id: t.id,
    transactionRef: `TXN-${bill?.bill_number || t.bill_id}-${t.method}`,
    orderId: t.bill_id,
    orderNumber: bill?.bill_number || t.bill_id,
    customerName,
    amount: t.amount,
    method: t.method as PaymentTransaction['method'],
    status: t.status as PaymentTransaction['status'],
    date: toIstDateTime(t.created_at),
  };
}

export async function fetchPaymentTransactions(): Promise<PaymentTransaction[]> {
  const [{ data: payments, error: payErr }, { data: bills, error: billErr }, { data: customers, error: custErr }] =
    await Promise.all([
      supabase.from('pos_payment_transactions').select('*').order('created_at', { ascending: false }).limit(500),
      fetchAllRows((from, to) => supabase.from('pos_bills').select('*').order('id').range(from, to)),
      fetchAllRows((from, to) => supabase.from('pos_customers').select('*').order('id').range(from, to)),
    ]);
  if (payErr) throw new Error(payErr.message);
  if (billErr) throw new Error(billErr.message);
  if (custErr) throw new Error(custErr.message);

  const billById = new Map(((bills || []) as DbPosBill[]).map((b) => [b.id, b]));
  const customerById = new Map(((customers || []) as DbPosCustomer[]).map((c) => [c.id, c]));

  return (payments || []).map((t: any) => {
    const bill = billById.get(t.bill_id);
    const customerName = bill?.pos_customer_id ? customerById.get(bill.pos_customer_id)?.name || 'Walk-in Customer' : 'Walk-in Customer';
    return mapPaymentTransaction(t, bill, customerName);
  });
}

function mapReturn(
  r: DbPosReturn,
  bill: DbPosBill | undefined,
  item: DbPosBillItem | undefined,
  customerName: string
): ReturnRequest {
  return {
    id: r.id,
    returnNumber: r.return_number,
    orderId: r.bill_id,
    orderNumber: bill?.bill_number || r.bill_id,
    customerId: bill?.pos_customer_id || 'guest',
    customerName,
    productTitle: item?.product_name || '',
    variantName: item ? variantLabel(item.size, item.color) : '',
    reason: r.reason,
    condition: r.condition || '',
    refundAmount: r.refund_amount,
    status: r.status as ReturnStatus,
    createdAt: toIstDateTime(r.created_at),
    billItemId: r.bill_item_id,
    variantId: item?.variant_id || undefined,
    productId: item?.product_id || undefined,
    qty: r.qty,
  };
}

export async function fetchReturns(): Promise<ReturnRequest[]> {
  const [{ data: returns, error: retErr }, { data: bills, error: billErr }, { data: items, error: itemErr }, { data: customers, error: custErr }] =
    await Promise.all([
      fetchAllRows((from, to) =>
        supabase.from('pos_returns').select('*').order('created_at', { ascending: false }).order('id').range(from, to)
      ),
      fetchAllRows((from, to) => supabase.from('pos_bills').select('*').order('id').range(from, to)),
      fetchAllRows((from, to) => supabase.from('pos_bill_items').select('*').order('id').range(from, to)),
      fetchAllRows((from, to) => supabase.from('pos_customers').select('*').order('id').range(from, to)),
    ]);
  if (retErr) throw new Error(retErr.message);
  if (billErr) throw new Error(billErr.message);
  if (itemErr) throw new Error(itemErr.message);
  if (custErr) throw new Error(custErr.message);

  const billById = new Map(((bills || []) as DbPosBill[]).map((b) => [b.id, b]));
  const itemById = new Map(((items || []) as DbPosBillItem[]).map((i) => [i.id, i]));
  const customerById = new Map(((customers || []) as DbPosCustomer[]).map((c) => [c.id, c]));

  return ((returns || []) as DbPosReturn[]).map((r) => {
    const bill = billById.get(r.bill_id);
    const customerName = bill?.pos_customer_id ? customerById.get(bill.pos_customer_id)?.name || 'Walk-in Customer' : 'Walk-in Customer';
    return mapReturn(r, bill, itemById.get(r.bill_item_id), customerName);
  });
}

export async function createReturn(input: {
  billId: string;
  billItemId: string;
  qty: number;
  reason: string;
  condition?: string;
  refundAmount: number;
  staffId: string | null;
}): Promise<ReturnRequest> {
  const { data, error } = await supabase
    .from('pos_returns')
    .insert({
      bill_id: input.billId,
      bill_item_id: input.billItemId,
      qty: input.qty,
      reason: input.reason,
      condition: input.condition || null,
      refund_amount: input.refundAmount,
      staff_id: input.staffId,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  const [{ data: bill }, { data: item }] = await Promise.all([
    supabase.from('pos_bills').select('*').eq('id', input.billId).single(),
    supabase.from('pos_bill_items').select('*').eq('id', input.billItemId).single(),
  ]);

  let customerName = 'Walk-in Customer';
  if (bill?.pos_customer_id) {
    const { data: c } = await supabase.from('pos_customers').select('*').eq('id', bill.pos_customer_id).single();
    customerName = (c as DbPosCustomer | null)?.name || customerName;
  }

  return mapReturn(data, bill as DbPosBill, item as DbPosBillItem, customerName);
}

export async function updateReturnStatusDb(returnId: string, status: ReturnStatus): Promise<void> {
  const { error } = await supabase.from('pos_returns').update({ status }).eq('id', returnId);
  if (error) throw new Error(error.message);
}

export async function recordTestPrint(): Promise<void> {
  const { data: existing } = await supabase.from('pos_settings').select('id').limit(1).maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from('pos_settings')
      .update({ last_test_print: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('pos_settings').insert({ last_test_print: new Date().toISOString() });
    if (error) throw new Error(error.message);
  }
}
