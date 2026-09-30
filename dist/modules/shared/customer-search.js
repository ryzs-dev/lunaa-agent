"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeSearchTerm = sanitizeSearchTerm;
exports.looksLikePhone = looksLikePhone;
exports.phoneSearchVariants = phoneSearchVariants;
exports.customerSearchOrFilter = customerSearchOrFilter;
exports.findCustomerIdsBySearch = findCustomerIdsBySearch;
const supabase_1 = require("../supabase");
function sanitizeSearchTerm(term) {
    return term.trim().replace(/[%_,"()]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
}
function looksLikePhone(term) {
    const compact = term.replace(/[\s()+-]/g, '');
    return /^\d{6,15}$/.test(compact);
}
function phoneSearchVariants(term) {
    if (!looksLikePhone(term))
        return [];
    const digits = term.replace(/\D/g, '');
    if (digits.length < 6)
        return [];
    const variants = new Set([digits]);
    if (digits.startsWith('0')) {
        variants.add(`60${digits.slice(1)}`);
    }
    if (digits.startsWith('60')) {
        variants.add(`0${digits.slice(2)}`);
        variants.add(digits.slice(2));
    }
    if (digits.startsWith('65')) {
        variants.add(digits.slice(2));
    }
    return [...variants];
}
function customerSearchOrFilter(term) {
    const safe = sanitizeSearchTerm(term);
    if (!safe)
        return '';
    const parts = [
        `name.ilike."%${safe}%"`,
        `email.ilike."%${safe}%"`,
        `phone_number.ilike."%${safe}%"`,
        `fb_name.ilike."%${safe}%"`,
    ];
    for (const variant of phoneSearchVariants(safe)) {
        parts.push(`phone_number.ilike."%${variant}%"`);
    }
    return [...new Set(parts)].join(',');
}
async function findCustomerIdsBySearch(term) {
    const filter = customerSearchOrFilter(term);
    if (!filter)
        return [];
    const { data, error } = await supabase_1.supabase
        .from('customers')
        .select('id')
        .or(filter)
        .limit(500);
    if (error)
        throw error;
    return (data !== null && data !== void 0 ? data : []).map((row) => row.id);
}
