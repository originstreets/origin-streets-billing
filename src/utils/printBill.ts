import { CommerceSettings, Order } from '../types';
import { PrintableReceiptData, printTaxInvoice, printThermalReceipt } from './receiptPrinter';

// The Origin wordmark printed at the top of a bill (black, for thermal
// printers). Served by the app itself, so it loads wherever the app runs.
export function billLogoUrl(): string {
  return `${window.location.origin}/brand/origin-wordmark-black.png`;
}

// The shop's part of every printed bill, straight from Settings -> Bill
// details. taxRate is the rate this bill was actually charged.
export function shopPrintSettings(
  settings: CommerceSettings,
  taxRate: number,
  taxIsCustom?: boolean
): NonNullable<PrintableReceiptData['storeSettings']> {
  return {
    storeName: settings.brand || settings.storeName,
    tagline: settings.tagline,
    address: settings.address,
    cityState: settings.cityState,
    state: settings.state,
    phone: settings.phone,
    email: settings.email,
    gstin: settings.gstin,
    terms: settings.terms,
    footer: settings.footer,
    taxRate,
    taxIsCustom,
    thankYou: settings.bill.thankYou,
    qrLabel: settings.bill.qrLabel,
    invoiceTitle: settings.bill.invoiceTitle,
    signatory: settings.bill.signatory,
    computerNote: settings.bill.computerNote,
    logoUrl: settings.bill.showLogo ? billLogoUrl() : undefined,
    showQr: settings.bill.showQr,
    showBarcode: settings.bill.showBarcode,
  };
}

// Every place that prints a shop bill builds the print the same way: the
// bill's own amounts and tax rate, plus the shop's details from settings.
export function receiptDataFor(bill: Order, settings: CommerceSettings): PrintableReceiptData {
  return {
    // Its QR code opens this bill online (see utils/billQr.ts).
    billId: bill.id,
    orderNumber: bill.orderNumber,
    createdAt: bill.createdAt,
    customerName: bill.customerName,
    customerPhone: bill.customerPhone,
    customerEmail: bill.customerEmail,
    customerGstin: bill.customerGstin,
    items: bill.items,
    subtotal: bill.subtotal,
    discount: bill.discount,
    discountReason: bill.discountReason,
    taxAmount: bill.taxAmount,
    grandTotal: bill.grandTotal,
    paymentMethod: bill.paymentMethod,
    paymentSplits: bill.paymentSplits,
    changeAmount: bill.changeAmount,
    // Always the rate this bill was actually charged, never today's settings.
    storeSettings: shopPrintSettings(settings, bill.taxRate ?? 0, bill.taxIsCustom),
  };
}

export function printBill(bill: Order, settings: CommerceSettings, kind: 'SLIP' | 'TAX_INVOICE'): Promise<boolean> {
  const data = receiptDataFor(bill, settings);
  return kind === 'SLIP' ? printThermalReceipt(data) : printTaxInvoice(data);
}
