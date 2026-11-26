jest.mock('../../queue', () => ({ __esModule: true, default: {} }));
jest.mock('../../supabase', () => ({ supabase: {} }));
jest.mock('../../customer/service', () => ({ __esModule: true, default: class {} }));
jest.mock('../../address/service', () => ({ __esModule: true, default: class {} }));
jest.mock('../../orders/service', () => ({ __esModule: true, default: class {} }));
jest.mock('../../google/service', () => ({ GoogleSheetService: class {} }));
jest.mock('../../orders/database', () => ({ shipmentDescriptionFor: () => '' }));

import { locateAddress, matchItems, readItems } from '../converra-order-intake';

const products = [
  { id: 'p-w', code: 'w', name: 'Wash' },
  { id: 'p-f', code: 'f', name: 'Femlift 30ml' },
  { id: 'p-f10', code: 'f10ml', name: 'Femlift 10ml' },
  { id: 'p-b', code: 'b', name: 'Blossom' },
  { id: 'p-rose', code: 'rose', name: 'Femrose' },
];

describe('items typed in Converra', () => {
  it('match by product code or product name, whatever the capitals', () => {
    const result = matchItems(
      [
        { name: 'W', quantity: 2 },
        { name: 'femlift 30ml', quantity: 1 },
        { name: 'Rose', quantity: 3 },
      ],
      products
    );
    expect(result.unknown).toEqual([]);
    expect(result.items).toEqual([
      { product_id: 'p-w', quantity: 2 },
      { product_id: 'p-f', quantity: 1 },
      { product_id: 'p-rose', quantity: 3 },
    ]);
  });

  it('reads an order line typed the old way as one item', () => {
    const result = matchItems([{ name: '2w 1f10ml', quantity: 1 }], products);
    expect(result.unknown).toEqual([]);
    expect(result.items).toEqual([
      { product_id: 'p-w', quantity: 2 },
      { product_id: 'p-f10', quantity: 1 },
    ]);
  });

  it('adds up the same product typed twice', () => {
    const result = matchItems(
      [
        { name: 'b', quantity: 1 },
        { name: 'Blossom', quantity: 2 },
      ],
      products
    );
    expect(result.items).toEqual([{ product_id: 'p-b', quantity: 3 }]);
  });

  it('names what is not a product', () => {
    const result = matchItems(
      [
        { name: 'w', quantity: 1 },
        { name: 'Starter set', quantity: 1 },
        { name: '2w1x', quantity: 1 },
      ],
      products
    );
    expect(result.unknown).toEqual(['Starter set', '2w1x']);
  });

  it('accepts the list as JSON text too', () => {
    expect(readItems('[{"name":" w ","quantity":"2"},{"name":"","quantity":1},{"name":"f"}]')).toEqual([
      { name: 'w', quantity: 2 },
      { name: 'f', quantity: 1 },
    ]);
    expect(readItems('not json')).toEqual([]);
  });
});

describe('the delivery address', () => {
  it('finds the postcode, city and state, also when a house number has a letter', () => {
    const address = locateAddress('No 12B, Jalan Bukit Indah 3/2\nTaman Bukit Indah, 81200 Johor Bahru, Johor');
    expect(address.postcode).toBe('81200');
    expect(address.state).toMatch(/johor/i);
    expect(address.country).toBe('Malaysia');
    expect(address.full_address).toBe('No 12B, Jalan Bukit Indah 3/2, Taman Bukit Indah, 81200 Johor Bahru, Johor');
  });

  it('takes the postcode, not a five-digit lot number before it', () => {
    expect(locateAddress('Lot 12345, Jalan Ampang, 50450 Kuala Lumpur').postcode).toBe('50450');
  });

  it('knows a Singapore address', () => {
    const address = locateAddress('Blk 123 Ang Mo Kio Ave 3 #05-12 Singapore 560123');
    expect(address).toMatchObject({ postcode: '560123', country: 'Singapore' });
  });

  it('keeps the address when nothing can be read from it', () => {
    expect(locateAddress('Near the old market')).toEqual({
      full_address: 'Near the old market',
      postcode: '',
      city: '',
      state: '',
      country: '',
    });
  });
});
