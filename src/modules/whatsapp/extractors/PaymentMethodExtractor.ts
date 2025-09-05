import { IExtractor } from "./IExtractor";

export class PaymentMethodExtractor implements IExtractor<string> {
  private readonly methods = [
    { pattern: /\b(cod|cash\s*on\s*delivery)\b/i, method: "COD" },
    { pattern: /\b(tng|touch\s*n\s*go|touchngo)\b/i, method: "TNG" },
    { pattern: /\b(bank\s*transfer|transfer|fpx)\b/i, method: "BANK TRANSFER" },
    { pattern: /\b(card|credit\s*card|debit\s*card)\b/i, method: "CARD" },
    { pattern: /\b(grab\s*pay|grabpay)\b/i, method: "GRABPAY" },
    { pattern: /\b(boost)\b/i, method: "BOOST" },
    { pattern: /\b(maya|paymaya)\b/i, method: "MAYA" },
    { pattern: /\b(gcash)\b/i, method: "GCASH" },
    { pattern: /\b(cash|tunai)\b/i, method: "CASH" },
    { pattern: /\b(atome)\b/i, method: "ATOME" },
  ];

  extract(text: string): string | null {
    if (!text) return null;
    for (const { pattern, method } of this.methods) {
      if (pattern.test(text)) return method;
    }
    return null;
  }
}