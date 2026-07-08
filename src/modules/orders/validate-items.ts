import { UUID } from 'crypto';
import { OrderItemsInput } from './types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizeProductId(productId: string): UUID | null {
  const normalized = productId.replace(/-duplicated$/i, '').trim();
  return UUID_PATTERN.test(normalized) ? (normalized as UUID) : null;
}

export function validateOrderItems(
  orderItems: OrderItemsInput[]
): OrderItemsInput[] {
  if (!orderItems?.length) {
    throw new Error('At least one order item is required');
  }

  const validated = orderItems.map((item, index) => {
    const productId = sanitizeProductId(String(item.product_id ?? ''));
    const quantity = Number(item.quantity);

    if (!productId) {
      throw new Error(`Order item ${index + 1} has an invalid product`);
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Order item ${index + 1} must have a quantity greater than 0`);
    }

    return {
      product_id: productId,
      quantity: Math.trunc(quantity),
    };
  });

  const uniqueProductIds = new Set(validated.map((item) => item.product_id));
  if (uniqueProductIds.size !== validated.length) {
    throw new Error('Duplicate products are not allowed in the same order');
  }

  return validated;
}
