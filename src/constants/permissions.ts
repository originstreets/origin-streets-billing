// The 4 real POS roles backed by the pos_role DB enum. StaffRole (app-wide
// type) also has a legacy 'ADMIN' value that has no DB-level POS role.
export type DbStaffRole = 'OWNER' | 'MANAGER' | 'BILLING' | 'FULFILLMENT';

export type PermissionKey =
  | 'DASHBOARD'
  | 'BILLING'
  | 'BILLS'
  | 'TAGS'
  | 'AUDIT'
  | 'MONTHLY_BILLS'
  | 'PRODUCTS'
  | 'CUSTOMERS'
  | 'SETTINGS';

export const ALL_PERMISSIONS: PermissionKey[] = [
  'DASHBOARD',
  'BILLING',
  'BILLS',
  'TAGS',
  'AUDIT',
  'MONTHLY_BILLS',
  'PRODUCTS',
  'CUSTOMERS',
  'SETTINGS',
];

// Plain words for each screen (translated with tr() where shown).
export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  DASHBOARD: 'Home',
  BILLING: 'Make new bills',
  BILLS: 'See and cancel bills',
  TAGS: 'Print price tags',
  AUDIT: 'Check sales',
  MONTHLY_BILLS: 'Monthly GST report',
  PRODUCTS: 'Products & stock',
  CUSTOMERS: 'Customers',
  SETTINGS: 'Settings & staff',
};

export const DEFAULT_PERMISSIONS_BY_ROLE: Record<DbStaffRole, PermissionKey[]> = {
  OWNER: [...ALL_PERMISSIONS],
  MANAGER: ['DASHBOARD', 'BILLING', 'BILLS', 'TAGS', 'AUDIT', 'MONTHLY_BILLS', 'PRODUCTS', 'CUSTOMERS'],
  BILLING: ['DASHBOARD', 'BILLING', 'BILLS', 'CUSTOMERS'],
  FULFILLMENT: ['DASHBOARD', 'BILLS'],
};

// Database access (user_roles) is given by the database when a login is
// made: owner/manager -> 'admin', cashier/packing -> 'staff'
// (db/migrations/0005_staff_logins.sql).
