export interface OrderDB {
    id?: number;
    orderNumber?: string;
    customerId: number;
    shippingAddressId?: number;
    orderDate?: string;
    status?:
      | "pending"
      | "confirmed"
      | "shipped"
      | "delivered"
    subtotal?: number;
    postage?: number;
    platformCharges?: number;
    totalAmount: number;
    currency?: string;
    paymentMethod?: string;
    paymentStatus?: "pending" | "paid";
    cashSaleReceipt?: string;
    trackingNumber?: string;
    courierCompany?: string;
    shipmentDescription?: string;
    source?: string;
    agentName?: string;
    notes?: string;
    remark?: string;
    createdAt?: string;
    updatedAt?: string;
  }