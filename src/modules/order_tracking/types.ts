export interface OrderTrackingInput {
    tracking_number:string;
    courier:string;
    status:"pending" | "shipped" | "delivered" | "returned";
}