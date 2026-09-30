import { supabase } from '../supabase';
import {
  CountryCode,
  countryFromPhone,
  detectCustomerCountry,
} from '../../utils/country';

const TTL_MS = 5 * 60 * 1000;
const PAGE_SIZE = 1000;

type CountryIndex = {
  byId: Map<string, CountryCode | null>;
  // Customers whose address says a different country than their phone prefix.
  // Keeping only these exceptions keeps the PostgREST filter URL short.
  sgWithoutSgPhone: string[];
  notSgWithSgPhone: string[];
  counts: Record<CountryCode, number>;
};

let cached: { index: CountryIndex; at: number } | null = null;
let loading: Promise<CountryIndex> | null = null;

async function fetchAll<T>(table: string, columns: string, orderBy: string) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderBy, { ascending: false })
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

async function buildIndex(): Promise<CountryIndex> {
  const [customers, addresses] = await Promise.all([
    fetchAll<{ id: string; phone_number: string }>(
      'customers',
      'id, phone_number',
      'created_at'
    ),
    fetchAll<{
      customer_id: string;
      full_address: string | null;
      postcode: string | null;
      country: string | null;
    }>('addresses', 'customer_id, full_address, postcode, country', 'created_at'),
  ]);

  const addressesByCustomer = new Map<string, typeof addresses>();
  for (const address of addresses) {
    const list = addressesByCustomer.get(address.customer_id) ?? [];
    list.push(address);
    addressesByCustomer.set(address.customer_id, list);
  }

  const index: CountryIndex = {
    byId: new Map(),
    sgWithoutSgPhone: [],
    notSgWithSgPhone: [],
    counts: { MY: 0, SG: 0 },
  };

  for (const customer of customers) {
    const country =
      detectCustomerCountry(
        customer.phone_number,
        addressesByCustomer.get(customer.id) ?? []
      ) ?? 'MY';
    const phoneIsSg = countryFromPhone(customer.phone_number) === 'SG';

    index.byId.set(customer.id, country);
    index.counts[country] += 1;
    if (country === 'SG' && !phoneIsSg) index.sgWithoutSgPhone.push(customer.id);
    if (country !== 'SG' && phoneIsSg) index.notSgWithSgPhone.push(customer.id);
  }

  return index;
}

export async function getCountryIndex(): Promise<CountryIndex> {
  const fresh = cached && Date.now() - cached.at < TTL_MS;
  if (cached && fresh) return cached.index;

  loading ??= buildIndex()
    .then((index) => {
      cached = { index, at: Date.now() };
      return index;
    })
    .finally(() => {
      loading = null;
    });

  // Serve the stale index while a refresh runs in the background.
  return cached ? cached.index : loading;
}

export function customerCountry(
  index: CountryIndex,
  customer: { id: string; phone_number?: string | null }
): CountryCode {
  return index.byId.get(customer.id) ?? countryFromPhone(customer.phone_number) ?? 'MY';
}

export function countryOrFilter(index: CountryIndex, country: CountryCode): string {
  const inList = (ids: string[]) => `(${ids.join(',')})`;
  const { sgWithoutSgPhone: sgExtra, notSgWithSgPhone: sgExcluded } = index;

  const phoneCondition =
    country === 'SG' ? 'phone_number.like.65*' : 'phone_number.not.like.65*';
  const excluded = country === 'SG' ? sgExcluded : sgExtra;
  const included = country === 'SG' ? sgExtra : sgExcluded;

  const parts = [
    excluded.length
      ? `and(${phoneCondition},id.not.in.${inList(excluded)})`
      : `and(${phoneCondition})`,
  ];
  if (included.length) parts.push(`id.in.${inList(included)}`);
  return parts.join(',');
}
