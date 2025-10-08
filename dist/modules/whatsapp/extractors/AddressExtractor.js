"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddressExtractor = void 0;
const malaysia_postcodes_1 = require("malaysia-postcodes");
class AddressExtractor {
    constructor() {
        this.MALAYSIA_STATES = [
            "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang",
            "Penang", "Pulau Pinang", "Perak", "Perlis", "Sabah", "Sarawak",
            "Selangor", "Terengganu", "Kuala Lumpur", "Putrajaya", "Labuan"
        ];
    }
    extract(text) {
        if (!text)
            return null;
        // Split and filter junk lines
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const filteredLines = lines.filter(line => {
            if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line))
                return false; // date
            if (/total|rpt/i.test(line))
                return false; // total/report
            if (/contact[:：]?/i.test(line))
                return false; // contact
            if (/^\+?\d{8,12}$/.test(line))
                return false; // phone
            if (/\d+[wfsb]\d*(ml)?/i.test(line))
                return false; // product codes
            if (/name[:：]/i.test(line))
                return false; // name
            if (/email[:：]?/i.test(line))
                return false; // email
            return true;
        });
        const src = filteredLines.join(" ");
        // Extract postcode (Malaysia = 5 digits)
        const postcodeMatch = src.match(/\b\d{5}\b/);
        const postcode = postcodeMatch ? postcodeMatch[0] : "";
        let city = "";
        let state = "";
        if (postcode) {
            // Try to resolve postcode -> state + city
            const result = (0, malaysia_postcodes_1.findPostcode)(postcode, true);
            if (result.found && result.results && result.results.length > 0) {
                const first = result.results[0];
                city = first.city;
                state = first.state;
            }
        }
        // If still missing state, fall back to regex scan
        if (!state) {
            for (const s of this.MALAYSIA_STATES) {
                if (new RegExp(`\\b${s}\\b`, "i").test(src)) {
                    state = s;
                    break;
                }
            }
        }
        // If still missing city, try to infer from raw text
        if (!city && state) {
            const result = (0, malaysia_postcodes_1.findCities)(src, false);
            if (result.found && result.results && result.results.length > 0) {
                city = result.results[0].city;
            }
        }
        // Determine country
        const country = postcode.length === 6 ? "Singapore" : "Malaysia";
        // Clean address string
        let address = src
            .replace(postcode, "")
            .replace(state, "")
            .replace(city, "")
            .replace(/Name[:：].*?,?/i, "")
            .replace(/Contact[:：]?.*?,?/i, "")
            .replace(/Email[:：]?.*?,?/i, "")
            .replace(country, "")
            .replace(/\s*,\s*/g, ", ")
            .trim();
        address = address.replace(/\b\d+[wfsb]\d*(ml)?\b/gi, "").trim();
        address = address.replace(/^,|,$/g, "").trim();
        address = address.replace(/\b(Address|Addr|Add)[:：]\s*/i, "");
        return {
            address,
            postcode,
            city,
            state,
            country,
        };
    }
}
exports.AddressExtractor = AddressExtractor;
