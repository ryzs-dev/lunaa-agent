"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCountryIndex = getCountryIndex;
exports.customerCountry = customerCountry;
exports.countryOrFilter = countryOrFilter;
const supabase_1 = require("../supabase");
const country_1 = require("../../utils/country");
const TTL_MS = 5 * 60 * 1000;
const PAGE_SIZE = 1000;
let cached = null;
let loading = null;
async function fetchAll(table, columns, orderBy) {
    const rows = [];
    for (let from = 0;; from += PAGE_SIZE) {
        const { data, error } = await supabase_1.supabase
            .from(table)
            .select(columns)
            .order(orderBy, { ascending: false })
            .order('id')
            .range(from, from + PAGE_SIZE - 1);
        if (error)
            throw error;
        rows.push(...(data !== null && data !== void 0 ? data : []));
        if (!data || data.length < PAGE_SIZE)
            return rows;
    }
}
async function buildIndex() {
    var _a, _b, _c;
    const [customers, addresses] = await Promise.all([
        fetchAll('customers', 'id, phone_number', 'created_at'),
        fetchAll('addresses', 'customer_id, full_address, postcode, country', 'created_at'),
    ]);
    const addressesByCustomer = new Map();
    for (const address of addresses) {
        const list = (_a = addressesByCustomer.get(address.customer_id)) !== null && _a !== void 0 ? _a : [];
        list.push(address);
        addressesByCustomer.set(address.customer_id, list);
    }
    const index = {
        byId: new Map(),
        sgWithoutSgPhone: [],
        notSgWithSgPhone: [],
        counts: { MY: 0, SG: 0 },
    };
    for (const customer of customers) {
        const country = (_c = (0, country_1.detectCustomerCountry)(customer.phone_number, (_b = addressesByCustomer.get(customer.id)) !== null && _b !== void 0 ? _b : [])) !== null && _c !== void 0 ? _c : 'MY';
        const phoneIsSg = (0, country_1.countryFromPhone)(customer.phone_number) === 'SG';
        index.byId.set(customer.id, country);
        index.counts[country] += 1;
        if (country === 'SG' && !phoneIsSg)
            index.sgWithoutSgPhone.push(customer.id);
        if (country !== 'SG' && phoneIsSg)
            index.notSgWithSgPhone.push(customer.id);
    }
    return index;
}
async function getCountryIndex() {
    const fresh = cached && Date.now() - cached.at < TTL_MS;
    if (cached && fresh)
        return cached.index;
    loading !== null && loading !== void 0 ? loading : (loading = buildIndex()
        .then((index) => {
        cached = { index, at: Date.now() };
        return index;
    })
        .finally(() => {
        loading = null;
    }));
    // Serve the stale index while a refresh runs in the background.
    return cached ? cached.index : loading;
}
function customerCountry(index, customer) {
    var _a, _b;
    return (_b = (_a = index.byId.get(customer.id)) !== null && _a !== void 0 ? _a : (0, country_1.countryFromPhone)(customer.phone_number)) !== null && _b !== void 0 ? _b : 'MY';
}
function countryOrFilter(index, country) {
    const inList = (ids) => `(${ids.join(',')})`;
    const { sgWithoutSgPhone: sgExtra, notSgWithSgPhone: sgExcluded } = index;
    const phoneCondition = country === 'SG' ? 'phone_number.like.65*' : 'phone_number.not.like.65*';
    const excluded = country === 'SG' ? sgExcluded : sgExtra;
    const included = country === 'SG' ? sgExtra : sgExcluded;
    const parts = [
        excluded.length
            ? `and(${phoneCondition},id.not.in.${inList(excluded)})`
            : `and(${phoneCondition})`,
    ];
    if (included.length)
        parts.push(`id.in.${inList(included)}`);
    return parts.join(',');
}
