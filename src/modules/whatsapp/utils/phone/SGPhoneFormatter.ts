// src/utils/phone/SingaporePhoneFormatter.ts
import { PhoneFormatter } from "./PhoneFormatter";

export class SingaporePhoneFormatter implements PhoneFormatter {
  normalize(phone: string): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, "");

    if (digits.startsWith("65")) return digits;
    if (digits.length === 8 && /^[3689]/.test(digits)) {
      return "65" + digits;
    }

    return null;
  }

  extract(text: string): string | null {
    if (!text) return null;

    const patterns = [
      /\b(\+?65\s*[689]\d{3}\s*\d{4})\b/g,
      /\b([689]\d{3}\s*\d{4})\b/g,
      /\b(\+?65\s*[689]\d{3}-\d{4})\b/g,
    ];

    return this.matchPatterns(text, patterns);
  }

  private matchPatterns(text: string, patterns: RegExp[]): string | null {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[0]) return match[0].replace(/\s+/g, "");
    }
    return null;
  }
}
