
export interface Shipment {
  shipmentDescription: string;  // shipment description
  trackingNumber: string;
  courierCompany: string;
  postageCost?: number;         // Postage (rm)
}