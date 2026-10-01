import { ShipmentInput } from '../parcel-daily/types';
import { countryFromPhone } from '../../utils/country';

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

// Parcel Daily courier codes. Whether a courier serves a given route is checked
// against its live quote when the shipment is booked.
const ALLOWED_SERVICE_PROVIDERS = new Set([
  'spx',
  'spxpromo',
  'dhl',
  'jnt',
  'jntcargo',
  'kex',
  'lex',
  'poslaju',
  'flash',
  'ninjavan',
  'citylink',
  'best',
  'bestcargo',
  'lineclear',
  'teleport',
  'redly',
  'aramex',
  'sfexd',
  'sfeconomy',
]);

const LEGACY_SERVICE_PROVIDERS: Record<string, string> = { sf_express: 'sfexd' };

export function buildShipmentFromOrder(
  order: OrderLike,
  options?: { isDropoff?: boolean; serviceProvider?: string },
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

  // The courier gets the phone with its country code stripped, so the code has
  // to follow the phone even when a Singapore customer ships to Malaysia.
  const phoneIsSingapore = countryFromPhone(phone) === 'SG';
  const addressCountry = order.addresses?.country?.trim();
  const isSingapore = addressCountry
    ? addressCountry === 'Singapore'
    : phoneIsSingapore;

  const requested = options?.serviceProvider?.trim().toLowerCase();
  const serviceProvider = requested
    ? LEGACY_SERVICE_PROVIDERS[requested] ?? requested
    : 'spx';
  if (!ALLOWED_SERVICE_PROVIDERS.has(serviceProvider)) {
    return { error: `Unsupported courier "${options?.serviceProvider}"` };
  }

  const shipment: ShipmentInput = {
    serviceProvider,
    clientAddress: {
      fullName: order.customers?.name?.trim() || 'Customer',
      countryCode: phoneIsSingapore ? '+65' : '+60',
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
