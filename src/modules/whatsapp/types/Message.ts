export interface Message {
  messageId: string;
  customerId: string;
  customerPhone: string;
  customerName?:string;
  orderId?: string;
  content: string;
  timestamp: Date;
}
