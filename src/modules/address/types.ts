import { UUID } from "crypto";

export interface AddressInput {
    customer_id: UUID
    full_address: string;
    postcode: string
    city: string;
    state: string;
    country: string;
}