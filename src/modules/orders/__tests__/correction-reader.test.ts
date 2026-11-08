jest.mock('../../queue', () => ({ __esModule: true, default: {} }));
jest.mock('../../supabase', () => ({ supabase: {} }));
jest.mock('../../receipts/settings', () => ({
  readingConfig: async () => ({ ready: false, reason: 'off' }),
}));

import { correctionToOrder, orderAfterChange } from '../correction-reader';

const products = [
  { id: 'p-w', code: 'w', name: 'Wash' },
  { id: 'p-f', code: 'f', name: 'Femlift 30ml' },
  { id: 'p-s', code: 's', name: 'Spray' },
];

const saved = {
  customer: { name: 'Elaine Yee', phone_number: '60143310771' },
  address: { city: 'Masai', state: 'Johor' },
  order: {
    order_date: '2026-11-06',
    order_items: [
      { product_id: 'p-w' as any, quantity: 2, product_name: 'Wash' },
      { product_id: 'p-s' as any, quantity: 2, product_name: 'Spray' },
    ],
    shipment_description: '2w2s',
    total_amount: 399,
  },
};

const blank = {
  understood: true,
  items: null,
  order_date: null,
  total_amount: null,
  buyer_name: null,
  phone_number: null,
  full_address: null,
  city: null,
  postcode: null,
  state: null,
  remark: null,
  question: null,
};

describe('correctionToOrder', () => {
  it('turns the new item list into order items and a shipment code', () => {
    const order = correctionToOrder({ ...blank, items: [{ code: 'W', quantity: 3 }, { code: 's', quantity: 2 }] }, products);
    expect(order?.order.order_items).toEqual([
      { product_id: 'p-w', quantity: 3, product_name: 'Wash' },
      { product_id: 'p-s', quantity: 2, product_name: 'Spray' },
    ]);
    expect(order?.order.shipment_description).toBe('3w2s');
  });

  it('drops items taken to zero and rejects unknown codes', () => {
    expect(
      correctionToOrder({ ...blank, items: [{ code: 'w', quantity: 2 }, { code: 's', quantity: 0 }] }, products)?.order
        .order_items
    ).toHaveLength(1);
    expect(correctionToOrder({ ...blank, items: [{ code: 'x', quantity: 1 }] }, products)).toBeNull();
  });

  it('leaves out what did not change', () => {
    const order = correctionToOrder({ ...blank, order_date: '2026-11-09' }, products);
    expect(order?.order).toMatchObject({ order_date: '2026-11-09', order_items: [], total_amount: 0 });
    expect(order?.customer.name).toBeUndefined();
  });
});

describe('orderAfterChange without Claude', () => {
  it('changes only the products the items line names', async () => {
    const result = await orderAfterChange(
      {
        customer: {},
        address: {},
        order: { order_date: '', order_items: [{ product_id: 'p-w' as any, quantity: 3 }], shipment_description: '3w', total_amount: 0 },
        partial: true,
        text: '3w',
      },
      saved
    );
    expect('data' in result && result.data.order.order_items).toEqual([
      { product_id: 'p-w', quantity: 3, product_name: 'Wash' },
      { product_id: 'p-s', quantity: 2, product_name: 'Spray' },
    ]);
  });

  it('uses the items line when Claude is off', async () => {
    const result = await orderAfterChange(
      {
        customer: {},
        address: {},
        order: { order_date: '', order_items: [{ product_id: 'p-f' as any, quantity: 1 }], shipment_description: '1f', total_amount: 0 },
        partial: true,
        text: '1f',
      },
      saved
    );
    expect('data' in result && result.data.order).toMatchObject({
      order_items: [
        { product_id: 'p-w', quantity: 2, product_name: 'Wash' },
        { product_id: 'p-s', quantity: 2, product_name: 'Spray' },
        { product_id: 'p-f', quantity: 1 },
      ],
      order_date: '2026-11-06',
      total_amount: 399,
    });
  });

  it('asks when nothing could be read', async () => {
    const result = await orderAfterChange(
      { customer: {}, address: {}, order: { order_date: '', order_items: [], total_amount: 0 }, partial: true, text: 'w + 1' },
      saved
    );
    expect(result).toEqual({ reply: "⚠️ Couldn't read the change: off" });
  });

  it('needs the saved order for a short message', async () => {
    const result = await orderAfterChange({ customer: {}, address: {}, order: {}, partial: true, text: 'w+1' }, null);
    expect('reply' in result).toBe(true);
  });
});
