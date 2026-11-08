jest.mock('../../queue', () => ({ __esModule: true, default: {} }));

import { displayDate, displayPhone, fillCorrection, orderButtons, orderButtonsOn, orderSummaryText, orderTestOn, parseOrderButton } from '../staff-check';
import { findSheetRowIndex, mergeSheetRow } from '../../../utils/sheetMapper';

const id = '0f8e2d4c-1a2b-4c3d-8e9f-001122334455';

const order = {
  customer: { name: 'Tan Mei Ling', phone_number: '60123456789' },
  address: { full_address: '1 Jalan A', city: 'Klang', postcode: '41000', state: 'Selangor' },
  order: {
    order_date: '2026-11-08',
    order_items: [{ product_id: 1, quantity: 2, product_name: 'Lunaa Pad' }],
    total_amount: 158,
    shipment_description: '2p',
  },
  remark: 'gift',
};

describe('order buttons', () => {
  it('round-trips Confirm and Change', () => {
    const [ok, fix] = orderButtons(id);
    expect(parseOrderButton(ok.id)).toEqual({ action: 'confirm', orderId: id });
    expect(parseOrderButton(fix.id)).toEqual({ action: 'change', orderId: id });
    expect(ok.title.length).toBeLessThanOrEqual(20);
  });

  it('is only on for the numbers in ORDER_BUTTONS', () => {
    expect(orderButtonsOn('60123456789', undefined)).toBe(false);
    expect(orderButtonsOn('60123456789', '+60 12-345 6789, 60111')).toBe(true);
    expect(orderButtonsOn('60199999999', '60123456789')).toBe(false);
    expect(orderButtonsOn('60199999999', 'all')).toBe(true);
  });

  it('reads test buttons and test numbers', () => {
    expect(parseOrderButton('order_fix:test')).toEqual({ action: 'change', orderId: 'test' });
    expect(orderTestOn('601126470411', '601126470411')).toBe(true);
    expect(orderTestOn('60123456789', '601126470411')).toBe(false);
    expect(orderTestOn('60123456789', 'all')).toBe(false);
    expect(orderTestOn('60123456789', undefined)).toBe(false);
  });

  it('ignores other buttons', () => {
    expect(parseOrderButton('yes')).toBeNull();
    expect(parseOrderButton(`order_drop:${id}`)).toBeNull();
  });
});

describe('orderSummaryText', () => {
  it('shows what the bot read', () => {
    expect(
      orderSummaryText({ heading: '✅ *ORD-1* saved', orderDate: '2026-11-08', data: order })
    ).toBe(
      [
        '✅ *ORD-1* saved',
        '📅 8 Nov 2026',
        '👤 Tan Mei Ling · 012-345 6789',
        '📍 Klang, Selangor',
        '',
        '2× Lunaa Pad',
        '💰 *RM 158.00*',
      ].join('\n')
    );
  });

  it('writes phone numbers the local way', () => {
    expect(displayPhone('60143310771')).toBe('014-331 0771');
    expect(displayPhone('601126470411')).toBe('011-2647 0411');
    expect(displayPhone('6591234567')).toBe('+6591234567');
  });

  it('says when no date was given', () => {
    expect(displayDate('')).toBeNull();
    expect(
      orderSummaryText({ heading: 'x', data: { ...order, order: { ...order.order, order_date: '' } } })
    ).toContain('📅 No date');
  });
});

describe('fillCorrection', () => {
  it('keeps what the correction left out', () => {
    const next = {
      customer: { name: '', phone_number: '60123456789' },
      address: {},
      order: { order_date: '', order_items: [{ product_id: 3, quantity: 1 }], total_amount: 80 },
    };
    const filled = fillCorrection(next as any, order);
    expect(filled.customer.name).toBe('Tan Mei Ling');
    expect(filled.address.city).toBe('Klang');
    expect(filled.order.order_date).toBe('2026-11-08');
    expect(filled.order.total_amount).toBe(80);
    expect(filled.order.order_items).toEqual([{ product_id: 3, quantity: 1 }]);
  });
});

describe('sheet correction', () => {
  const headers = ['Order Date', 'Name', 'Phone Number', 'Total Paid (RM)', 'Shipment Description', 'Status', 'Courier', 'Lunaa Pad', 'Lunaa Tea'];
  const rows = [
    headers,
    ['2026-11-07', 'Other', '0199999999', '50', '1t', 'Pending', '', '', '1'],
    ['2026-11-08', 'Tan Mei Ling', '60123456789', '158', '2p', 'Paid', 'J&T', '2', ''],
  ];

  it('finds the order row', () => {
    expect(findSheetRowIndex(rows, order as any)).toBe(2);
    expect(findSheetRowIndex(rows, { ...order, order: { ...order.order, total_amount: 1 } } as any)).toBe(-1);
  });

  it('rewrites the order and keeps what staff typed', () => {
    const next = {
      ...order,
      order: { ...order.order, order_date: '2026-11-09', total_amount: 80, shipment_description: '1t' },
      productQuantityMap: { 'Lunaa Tea': 1 },
    };
    expect(mergeSheetRow(rows[2], headers, next as any, ['Lunaa Pad'])).toEqual([
      '2026-11-09', 'Tan Mei Ling', '60123456789', 80, '1t', 'Paid', 'J&T', '', 1,
    ]);
  });
});
