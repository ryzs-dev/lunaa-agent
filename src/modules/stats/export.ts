import { supabase } from '../supabase';

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CHANNEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  shopee: 'Shopee',
  lazada: 'Lazada',
};

const COD: Record<string, string> = {
  out: 'COD out',
  pending: 'Pending COD payment',
  collected: 'COD collected',
};

export async function monthOrdersCsv(month: string) {
  const [year, monthIndex] = month.split('-').map(Number);
  const nextMonth =
    monthIndex === 12 ? `${year + 1}-01` : `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const start = new Date(`${month}-01T00:00:00+08:00`).toISOString();
  const end = new Date(`${nextMonth}-01T00:00:00+08:00`).toISOString();

  const rows: Record<string, any>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('orders')
      .select(
        'order_date, order_number, source, total_amount, shipment_description, agent_name, cod_status, buyer_name, customers(name, phone_number)'
      )
      .is('deleted_at', null)
      .gte('created_at', start)
      .lt('created_at', end)
      .order('order_date')
      .order('order_number')
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const header = ['Date', 'Order', 'Channel', 'Customer', 'Phone', 'Agent', 'COD', 'Items', 'Total'];
  const lines = [header.join(',')];
  for (const row of rows) {
    const customer = row.customers;
    lines.push(
      [
        String(row.order_date ?? '').slice(0, 10),
        row.order_number,
        CHANNEL[row.source] ?? 'WhatsApp',
        customer?.name || row.buyer_name || '',
        customer?.phone_number || '',
        row.agent_name || '',
        COD[row.cod_status] ?? '',
        row.shipment_description || '',
        row.total_amount ?? '',
      ]
        .map(csvCell)
        .join(',')
    );
  }
  return lines.join('\n');
}
