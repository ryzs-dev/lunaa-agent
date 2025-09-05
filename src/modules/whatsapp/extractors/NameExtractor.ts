import { IExtractor } from "./IExtractor";

export class NameExtractor implements IExtractor<string> {
  extract(text: string): string | null {
    const match = text.match(/(?:name[:：]\s*)?([\p{L} ]+)(?=\s*(?:contact|$))/iu);
    return match ? match[1].trim() : null;
  }
}