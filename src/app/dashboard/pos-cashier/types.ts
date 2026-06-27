export type ProductCategory = "bar" | "kitchen";
export type ShiftStatus = "OPEN" | "CLOSED";
export type PaymentMethod = "CASH" | "QRIS" | "DEBIT";

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  customNotes: string;
}

export interface CashierShift {
  id: string;
  openedBy: string;
  openTime: string;
  closeTime: string | null;
  initialCash: number;
  actualCash: number | null;
  status: ShiftStatus;
}

export interface ProductMenu {
  id: string;
  name: string;
  price: number;
  category: ProductCategory;
  currentStock: number;
  isAvailable: boolean;
}

export interface FinanceSummary {
  subtotal: number;
  servicePercent: number;
  serviceAmount: number;
  subtotalAfterService: number;
  taxPercent: number;
  taxAmount: number;
  grandTotal: number;
}

export interface CompletedTransaction {
  id: string;
  shiftId: string;
  paymentMethod: PaymentMethod;
  paidAmount: number;
  changeAmount: number;
  totalAmount: number;
  createdAt: string;
}
