import axios from 'axios';
import { ShipmentInput } from './types';
import { findPostcode } from 'malaysia-postcodes';
import { UUID } from 'crypto';
import { pub } from '../pubsub';
import { publishOrderCreated } from '../pubsub/publisher';
import { PubSubEvents } from '../pubsub/events';

// Must match the pickup address the parcel-daily service books orders from.
const PICKUP_ORIGIN = { postcode: '14000', country: 'Malaysia' } as const;
const COURIER_NAMES_TTL_MS = 24 * 60 * 60 * 1000;

export type QuoteInput = {
  postcode: string;
  country: 'Malaysia' | 'Singapore';
  weight: number;
  cod?: number;
};

export type QuoteResult = {
  couriers: { code: string; name: string; price: number; postage: number; codFee: number }[];
  destination: { state: string | null; city: string | null };
};

export class ParcelDailyService {
  constructor(private parcelDailyServiceURL: string) {}

  async getAccountInfo() {
    try {
      const response = await axios.get(
        `${this.parcelDailyServiceURL}/account-info`
      );
      return response.data;
    } catch (error) {
      throw new Error('Failed to fetch account info');
    }
  }

  async createShipment(shipmentData: ShipmentInput, crmOrderId: UUID) {
    const postcode = findPostcode(shipmentData.clientAddress.postcode, true);
    const normalizedPhone = this.normalizePhoneNumber(
      shipmentData.clientAddress.phone
    );
    const payload = {
      ...shipmentData,
      clientAddress: {
        ...shipmentData.clientAddress,
        phone: normalizedPhone,
        state: postcode.found && postcode.state,
        city: postcode.found && postcode.city,
      },
    };
    try {
      const response = await axios.post(
        `${this.parcelDailyServiceURL}/create-order`,
        { payload, crmOrderId }
      );

      if (response.data?.success === false) {
        return response.data;
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          success: false,
          status: error.response?.status || 500,
          message: 'Parcel Daily request failed',
          details: error.response?.data,
        };
      }

      return {
        success: false,
        status: 500,
        message: 'Unexpected error occurred.',
      };
    }
  }

  async createBulkShipments(shipments: ShipmentInput[]) {
    const enrichedShipments = shipments.map((shipment) => {
      const postcode = findPostcode(shipment.clientAddress.postcode, true);
      return {
        ...shipment,
        clientAddress: {
          ...shipment.clientAddress,
          state: postcode.found && postcode.state,
          city: postcode.found && postcode.city,
        },
      };
    });

    const normalizedPhones = enrichedShipments.map((shipment) =>
      this.normalizePhoneNumber(shipment.clientAddress.phone)
    );

    const payload = {
      shipments: enrichedShipments.map((shipment, index) => ({
        ...shipment,
        clientAddress: {
          ...shipment.clientAddress,
          phone: normalizedPhones[index],
        },
      })),
    };

    try {
      const response = await axios.post(
        `${this.parcelDailyServiceURL}/create-bulk-order`,
        payload
      );
      return response.data;
    } catch (error) {
      throw new Error('Failed to create bulk shipments');
    }
  }

  async getOrderStatus(orderId: UUID) {
    try {
      const response = await axios.get(
        `${this.parcelDailyServiceURL}/order/${orderId}`
      );
      return response.data;
    } catch (error) {
      throw new Error('Failed to fetch order status');
    }
  }

  private courierNames: { at: number; names: Record<string, string> } | null = null;

  private async getCourierNames(): Promise<Record<string, string>> {
    if (this.courierNames && Date.now() - this.courierNames.at < COURIER_NAMES_TTL_MS) {
      return this.courierNames.names;
    }
    try {
      const response = await axios.get(`${this.parcelDailyServiceURL}/couriers`);
      const list: { name: string; label: string }[] = response.data?.data?.data ?? [];
      const names = Object.fromEntries(list.map((c) => [c.label, c.name]));
      this.courierNames = { at: Date.now(), names };
      return names;
    } catch {
      return this.courierNames?.names ?? {};
    }
  }

  // Live prices for every courier Parcel Daily can use from our pickup address
  // to this destination. Couriers that don't serve the route are left out.
  async getQuotes(input: QuoteInput): Promise<QuoteResult> {
    const response = await axios.post(`${this.parcelDailyServiceURL}/check-rate`, {
      origin: PICKUP_ORIGIN.postcode,
      originCountry: PICKUP_ORIGIN.country,
      destination: input.postcode,
      destinationCountry: input.country,
      weight: input.weight,
      cod: input.cod ?? 0,
    });
    const quote = response.data?.data?.success ?? {};
    const names = await this.getCourierNames();
    const money = (value: unknown) => {
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? n : 0;
    };

    const couriers = Object.keys(quote)
      .filter((key) => key.endsWith('Price') && money(quote[key]) > 0)
      .map((key) => {
        const code = key.slice(0, -'Price'.length);
        return {
          code,
          name: names[code] ?? code,
          price: money(quote[key]),
          postage: money(quote[`${code}Postage`]),
          codFee: money(quote[`${code}Cod`]),
        };
      })
      .sort((a, b) => a.price - b.price);

    return {
      couriers,
      destination: {
        state: quote.toPostcode?.State ?? quote.toPostcode?.StateName ?? null,
        city: quote.toPostcode?.CityName ?? null,
      },
    };
  }

  private normalizePhoneNumber(phone: string): string {
    let normalized = phone.trim();

    if (normalized.startsWith('60') || normalized.startsWith('65')) {
      normalized = normalized.slice(2);
    }

    return normalized;
  }
}
