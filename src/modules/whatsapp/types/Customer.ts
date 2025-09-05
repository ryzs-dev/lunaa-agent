import { Address } from "./Address";
import { Message } from "./Message";

export interface Customer {
  customerId: string;
  fbName?:string;
  customerName: string;         // Name
  phoneNumber: string;
  addresses: Address[];
  isRepeatCustomer: 'repeat' | 'new';
  messages?: Message[];
  totalOrders?: number;      // Total orders
}