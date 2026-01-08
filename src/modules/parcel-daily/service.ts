import axios from 'axios';
import {ShipmentInput} from './types';
import {findPostcode} from 'malaysia-postcodes';
import {UUID} from 'crypto';

export class ParcelDailyService {
    constructor(private parcelDailyServiceURL: string) {
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
        console.log("Creating Shipment")
        try {
            const response = await axios.post(
                `${this.parcelDailyServiceURL}/create-order`,
                {payload, crmOrderId}
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
                    details: error.response?.data
                }
            }

            return {
                success: false,
                status: 500,
                message: 'Unexpected error occurred.',
            }
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

    private normalizePhoneNumber(phone: string): string {
        let normalized = phone.trim();

        if (normalized.startsWith('60') || normalized.startsWith('65')) {
            normalized = normalized.slice(2);
        }

        return normalized;
    }
}
