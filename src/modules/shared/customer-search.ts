import { supabase } from '../supabase';

export function sanitizeSearchTerm(term: string): string {
  return term.trim().replace(/[%_,"()]/g, '').slice(0, 80);
}

export function phoneSearchVariants(term: string): string[] {
  const digits = term.replace(/\D/g, '');
  if (digits.length < 4) return [];

  const variants = new Set<string>([digits]);

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

export function customerSearchOrFilter(term: string): string {
  const safe = sanitizeSearchTerm(term);
  if (!safe) return '';

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

export async function findCustomerIdsBySearch(term: string): Promise<string[]> {
  const filter = customerSearchOrFilter(term);
  if (!filter) return [];

  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .or(filter)
    .limit(500);

  if (error) throw error;
  return (data ?? []).map((row) => row.id);
}
