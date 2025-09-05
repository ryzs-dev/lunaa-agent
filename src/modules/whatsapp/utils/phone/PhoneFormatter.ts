
export interface PhoneFormatter {
  normalize(phone: string): string | null;
  extract(text: string): string | null;
}
