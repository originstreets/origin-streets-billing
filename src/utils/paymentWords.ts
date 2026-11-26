import { Order } from '../types';

// How a bill was paid, in plain words (translate with tr()).
export function methodWord(method: string): string {
  switch (method) {
    case 'CASH':
      return 'Cash';
    case 'UPI':
      return 'UPI';
    case 'CARD':
      return 'Card';
    case 'COD':
      return 'Cash on delivery';
    case 'RAZORPAY':
      return 'Paid online';
    case 'BANK':
      return 'Bank transfer';
    case 'SPLIT':
      return 'Split payment';
    default:
      return 'Other';
  }
}

export function paymentWord(order: Pick<Order, 'paymentMethod' | 'paymentSplits'>): string {
  if (order.paymentSplits && order.paymentSplits.length > 1) return 'Split payment';
  return methodWord(order.paymentMethod);
}

// "UPI · SBI current" when the shop QR it went to is known.
export function splitWord(s: { method: string; upiAccount?: string }, t: (x: string) => string): string {
  return s.upiAccount ? `${t(methodWord(s.method))} · ${s.upiAccount}` : t(methodWord(s.method));
}
