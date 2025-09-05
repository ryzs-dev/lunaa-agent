import { IExtractor } from "./IExtractor";

export interface IAddress {
  address: string;
  postcode: string;
  state: string;
  country: string;
}

export class AddressExtractor implements IExtractor<IAddress | null> {
  // Malaysia states
  private MALAYSIA_STATES = [
    "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang",
    "Penang", "Pulau Pinang", "Perak", "Perlis", "Sabah", "Sarawak",
    "Selangor", "Terengganu", "Kuala Lumpur", "Putrajaya", "Labuan"
  ];

  extract(text: string): IAddress | null {
    let src = text.trim();

    // Step 1: If there's an "address" label, slice from its last occurrence
    const idx = src.toLowerCase().lastIndexOf("address");
    if (idx !== -1) {
      src = src.slice(idx).replace(/^address[:：]?\s*/i, "").trim();
    }

    // Step 2: Find postcode (MY = 5 digits, SG = 6 digits)
    const postcodeMatch = src.match(/(\d{5}|\d{6})/);
    if (!postcodeMatch) {
      return { address: src, postcode: "", state: "", country: "" };
    }

    const postcode = postcodeMatch[1];
    const [before, after] = src.split(postcode, 2);

    let address = before.trim().replace(/^[, ]+|[, ]+$/g, "");
    let state = after.trim().replace(/^[, ]+|[, ]+$/g, "");
    let country = "";

    // Step 3: Identify country & state
    if (postcode.length === 6) {
      // Likely Singapore
      country = "Singapore";
      state = ""; // Singapore doesn't need a state
    } else {
      // Likely Malaysia
      country = "Malaysia";
      for (const s of this.MALAYSIA_STATES) {
        const regex = new RegExp(`\\b${s}\\b`, "i");
        if (regex.test(state)) {
          state = s;
          break;
        }
      }
    }

    return { address, postcode, state, country };
  }
}
