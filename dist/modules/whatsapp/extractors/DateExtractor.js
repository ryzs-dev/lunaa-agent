"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DateExtractor = void 0;
class DateExtractor {
    extract(text) {
        const match = text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
        if (!match)
            return null;
        const [day, month, year] = match[1].split(/[\/\-]/);
        const yyyy = year.length === 2 ? `20${year}` : year;
        return `${yyyy}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
}
exports.DateExtractor = DateExtractor;
