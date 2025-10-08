export interface Message {
  messageId: string;
  customerId: string;
  customerPhone: string;
  customerName?: string;
  orderId?: string;
  content: string;
  timestamp: Date;
}

export interface TemplateMessagePayload {
  to_number: string;
  template_name: string;
  parameters: Array<{ type: string; text: string }>;
}
