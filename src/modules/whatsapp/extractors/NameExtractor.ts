import { IExtractor } from "./IExtractor";
import { cleanCustomerName } from "../../../utils/customerName";

export class NameExtractor implements IExtractor<string | null> {
  extract(text: string): string | null {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // 1. Try explicit "Name:" first
    for (const line of lines) {
      const match = line.match(/\bname\b\s*[:：;；]?\s*(.*?)(?=\s*contact[:：]|$)/i);
      const name = match ? cleanCustomerName(match[1] ?? "") : "";
      if (name) return name;
    }

    // 2. Fallback: pick the first line that looks like a name (letters, spaces)
    for (const line of lines) {
      if (/^[\p{L} \(\)]+$/u.test(line)) {
        return line.trim();
      }
    }

    return null;
  }
}
