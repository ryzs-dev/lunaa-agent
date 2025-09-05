import { Agent } from "./Agent";
import { Customer } from "./Customer";
import { ProductOrder } from "./Product";
import { Shipment } from "./Shipment";

export interface OrderData {
  orderId: string;
  orderDate: string;
  customer: Customer;           
  products: ProductOrder[];     
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









