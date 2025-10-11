export interface ShipmentInput {
  serviceProvider: string;
  clientAddress: {
    fullName: string;
    countryCode: '+60' | '+65';
    phone: string;
    email?: string;
    line1: string;
    line2: string;
    city: string;
    postcode: string;
    state: string;
    country: 'Malaysia' | 'Singapore';
  };
  kg: number;
  price: number;
  cod?: number;
  content: 'Feminine Products';
  content_value: number;
  isDropoff: boolean;
}
