export interface CustomerDB {
  customerId?: number;
  fbName?:string;
  customerName: string;         // Name
  phoneNumber: string;
  isRepeatCustomer: 'repeat' | 'new';
  totalOrders?: number;
  totalSpent?: number;     
  email?: string;
  lastOrderDate?: string;
  createdAt?: string;
  updatedAt?: string;
}
