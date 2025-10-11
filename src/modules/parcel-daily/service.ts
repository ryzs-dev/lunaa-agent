import axios from 'axios';
import { ShipmentInput } from './types';
import { findPostcode } from 'malaysia-postcodes';
import { UUID } from 'crypto';

export class ParcelDailyService {
  constructor(private parcelDailyServiceURL: string) {}

  private normalizePhoneNumber(phone: string): string {
    let normalized = phone.trim();

    if (normalized.startsWith('60') || normalized.startsWith('65')) {
      normalized = normalized.slice(2);
    }

    return normalized;
  }

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
      return response.data;
    } catch (error) {
      throw new Error('Failed to create shipment');
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
}
