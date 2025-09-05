import { IExtractor } from "./IExtractor";

export class PhoneExtractor implements IExtractor<string> {
  extract(text: string): string | null {
    const match = text.match(/(01\d[\d\s\-]{6,10})/);
    return match ? match[1].replace(/\D/g, "") : null;
  }
}