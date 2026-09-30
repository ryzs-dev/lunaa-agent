import { findPostcode } from 'malaysia-postcodes';

export type CountryCode = 'MY' | 'SG';

export const COUNTRY_NAMES: Record<CountryCode, string> = {
  MY: 'Malaysia',
  SG: 'Singapore',
};

const MY_STATES =
  /\b(johor|kedah|kelantan|melaka|malacca|negeri sembilan|pahang|penang|pulau pinang|perak|perlis|sabah|sarawak|selangor|terengganu|kuala lumpur|putrajaya|labuan)\b/i;
const MY_STREET_WORDS = /\b(jalan|jln|taman|tmn|lorong|kampung|kg|persiaran|lebuh|pangsapuri)\b/i;
const SG_WORDS = /\b(singapore|s'pore)\b/i;
const SG_PREFIXED_POSTCODE = /\bS\s*\(?\d{6}\)?(?!\d)/i;
const SIX_DIGITS = /(?<!\d)\d{6}(?!\d)/;

function hasMalaysianPostcode(text: string): boolean {
  return [...text.matchAll(/(?<!\d)\d{5}(?!\d)/g)].some(
    (m) => findPostcode(m[0], true)?.found
  );
}

// Older import paths defaulted every address to "Malaysia", so the stored
// country is only a last resort after the address text and postcode, and a
// stored "Malaysia" on its own isn't trusted.
export function detectAddressCountry(address: {
  full_address?: string | null;
  postcode?: string | null;
  country?: string | null;
}): CountryCode | null {
  const text = address.full_address ?? '';

  if (SG_WORDS.test(text) || SG_PREFIXED_POSTCODE.test(text)) return 'SG';
  if (hasMalaysianPostcode(text) || MY_STATES.test(text)) return 'MY';
  if (SIX_DIGITS.test(text)) return 'SG';

  const postcode = address.postcode?.trim() ?? '';
  if (/^\d{6}$/.test(postcode)) return 'SG';
  if (/^\d{5}$/.test(postcode)) return 'MY';

  if (MY_STREET_WORDS.test(text)) return 'MY';

  return /^(singapore|sg)$/i.test(address.country?.trim() ?? '') ? 'SG' : null;
}

export function countryFromPhone(phone?: string | null): CountryCode | null {
  const digits = phone?.replace(/\D/g, '') ?? '';
  if (digits.startsWith('65')) return 'SG';
  if (digits.startsWith('60')) return 'MY';
  return null;
}

// Addresses are newest-first; the latest one with a recognisable country wins
// because that's where the customer is currently shipping to.
export function detectCustomerCountry(
  phone: string | null | undefined,
  addresses: Parameters<typeof detectAddressCountry>[0][]
): CountryCode | null {
  for (const address of addresses) {
    const country = detectAddressCountry(address);
    if (country) return country;
  }
  return countryFromPhone(phone);
}
