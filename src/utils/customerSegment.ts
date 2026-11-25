import { Customer, CustomerSegment } from '../types';

// VIP = spent more than the amount set in Settings -> Customers; otherwise
// someone who has bought before, or new.
export function customerSegment(c: Pick<Customer, 'totalSpend' | 'ordersCount'>, vipSpendThreshold: number): CustomerSegment {
  if (c.totalSpend > vipSpendThreshold) return 'VIP';
  return c.ordersCount > 0 ? 'ACTIVE' : 'NEW';
}
