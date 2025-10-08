// src/utils/phone/PhoneUtil.ts
import { SingaporePhoneFormatter } from "./SGPhoneFormatter";
import { MalaysiaPhoneFormatter } from "./MYPhoneFormatter";
import { PhoneFormatter } from "./PhoneFormatter";

export class PhoneUtil {
  private static formatters: PhoneFormatter[] = [
    new SingaporePhoneFormatter(),
    new MalaysiaPhoneFormatter(),
  ];

  static normalize(phone: string): string {
    for (const f of this.formatters) {
      const result = f.normalize(phone);
      if (result) return result;
    }
    return phone.replace(/\D/g, ""); // fallback
  }

  static extract(text: string): string | null {
    for (const f of this.formatters) {
      const result = f.extract(text);
      if (result) return result;
    }
    return null;
  }
}
