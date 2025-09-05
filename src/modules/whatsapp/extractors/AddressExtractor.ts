import { IExtractor } from "./IExtractor";

export interface IAddress {
  address: string;
  postcode: string;
  state: string;
  country: string;
}

export class AddressExtractor implements IExtractor<IAddress | null> {
  private MALAYSIA_STATES = [
    "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang",
    "Penang", "Pulau Pinang", "Perak", "Perlis", "Sabah", "Sarawak",
    "Selangor", "Terengganu", "Kuala Lumpur", "Putrajaya", "Labuan"
  ];

  extract(text: string): IAddress | null {
    if (!text) return null;

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // Remove lines that contain dates, product codes, contact info, total, etc.
    const filteredLines = lines.filter(line => {
      if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line)) return false; // date
      if (/total|rpt/i.test(line)) return false; // total/report
      if (/contact[:：]?/i.test(line)) return false; // contact
      if (/^\+?\d{8,12}$/.test(line)) return false; // phone
      if (/\d+[wfsb]\d*(ml)?/i.test(line)) return false;
      if (/name[:：]/i.test(line)) return false; // name
      return true;
    });

    let src = filteredLines.join(", ");

    

    // Extract postcode (5 digits for Malaysia)
    const postcodeMatch = src.match(/\b\d{5}\b/);
    const postcode = postcodeMatch ? postcodeMatch[0] : "";

    // Extract state
    let state = "";
    for (const s of this.MALAYSIA_STATES) {
      if (new RegExp(`\\b${s}\\b`, "i").test(src)) {
        state = s;
        break;
      }
    }

    // Determine country
    const country = postcode.length === 6 ? "Singapore" : "Malaysia";

    // Clean address: remove postcode, state, common extra labels
    let address = src
      .replace(postcode, "")
      .replace(state, "")
      .replace(/Name[:：].*?,?/i, "")
      .replace(/Contact[:：]?.*?,?/i, "")
      .replace(country, "")
      .replace(/\s*,\s*/g, ", ")
      .trim();

    address = address.replace(/\b\d+[wfsb]\d*(ml)?\b/gi, "").trim();
    address = address.replace(/^,|,$/g, "").trim();
    address = address.replace(/\b(Address|Addr|Add)[:：]\s*/i, "");


    return { address, postcode, state, country };
  }
}
