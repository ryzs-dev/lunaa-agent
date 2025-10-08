import { Agent } from "./Agent";
import { Customer } from "./Customer";
import { OrderItem } from "./OrderItem";
import { Shipment } from "./Shipment";

export interface Order {
  orderId: string;
  orderDate: string;
  customer: Customer;           
  items: OrderItem[];     
  totalPaid?: number;           
  productCode?: string;         
  remark?: string;
  paymentMethod?: string;         // fbname / agent group etc.
  shipment?: Shipment;
  isRepeatCustomer?: boolean;
  receiptNumber?: string;       // cash sale receipt
  agentName?: Agent;           // Agent by / under
  currency?: string;            // RM, USD etc.
}