import { ShipmentInput } from '../parcel-daily/types';

type OrderLike = {
  id?: string;
  total_amount?: number;
  shipment_description?: string | null;
  order_tracking?:
    | { tracking_number?: string | null }
    | { tracking_number?: string | null }[]
    | null;
  customers?: {
    name?: string | null;
    email?: string | null;
    phone_number?: string | null;
  } | null;
  addresses?: {
    full_address?: string | null;
    city?: string | null;
    postcode?: string | null;
    state?: string | null;
    country?: string | null;
  } | null;
};

function hasExistingTracking(
  tracking: OrderLike['order_tracking'],
): boolean {
  if (!tracking) return false;
  if (Array.isArray(tracking)) {
    return tracking.some((t) => Boolean(t?.tracking_number?.trim()));
  }
  return Boolean(tracking.tracking_number?.trim());
}

export function buildShipmentFromOrder(
  order: OrderLike,
  options?: { isDropoff?: boolean },
): {
  shipment?: ShipmentInput;
  error?: string;
} {
  if (hasExistingTracking(order.order_tracking)) {
    return { error: 'Order already has a tracking number' };
  }

  const phone = order.customers?.phone_number?.trim();
  const fullAddress = order.addresses?.full_address?.trim();
  const postcode = order.addresses?.postcode?.trim();

  if (!phone) {
    return { error: 'Missing customer phone number' };
  }
  if (!fullAddress || !postcode) {
    return { error: 'Missing delivery address or postcode' };
  }

  const isSingapore =
    order.addresses?.country === 'Singapore' || phone.startsWith('+65');

  const shipment: ShipmentInput = {
    serviceProvider: 'spx',
    clientAddress: {
      fullName: order.customers?.name?.trim() || 'Customer',
      countryCode: isSingapore ? '+65' : '+60',
      phone,
      email: order.customers?.email?.trim() || 'noreply@lunaa.local',
      line1: fullAddress,
      line2: '',
      city: order.addresses?.city?.trim() || '',
      postcode,
      state: order.addresses?.state?.trim() || '',
      country: isSingapore ? 'Singapore' : 'Malaysia',
    },
    kg: 0.5,
    price: 0,
    content: order.shipment_description?.trim() || 'Feminine Products',
    content_value: Number(order.total_amount) || 0,
    isDropoff: options?.isDropoff === true,
  };

  return { shipment };
}
