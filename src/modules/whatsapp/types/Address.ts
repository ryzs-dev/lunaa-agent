export interface Address {
  addressLine1: string;         // spreadsheet "address"
  addressLine2?: string;
  city?: string;
  state: string;
  postcode: string;
  country?: string;
}