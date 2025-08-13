export interface Order {
  id?: number;
  order_date?: Date | string; // Use Date for internal processing, string for JSON serialization
  fb_name?: string;
  customer_name?: string;
  payment_method?: string;
  wash_qty?: number;
  femlift_30ml_qty?: number;
  femlift_10ml_qty?: number;
  wash_30ml_qty?: number;
  spray_qty?: number;
  remark?: string;
  package_price?: number;
  postage?: number;
  total_paid?: number;
  shipment_description?: string;
  phone_number?: string;
  tracking_number?: string;
  courier_company?: string;
  status?: string;
  new_or_repeat?: "new" | "repeat";
  cash_sale_receipt?: string;
  agent_name?: string;
  currency?: string;
  created_at?: string;
  updated_at?: string;
}

// Message interface for the messages table
export interface Message {
  id?: number;
  sid: string; // Twilio message SID
  order_id?: number; // Foreign key to orders table
  to_number: string; // WhatsApp number (with whatsapp: prefix)
  from_number: string; // Twilio WhatsApp number
  message_type?: string; // 'whatsapp', 'sms', etc.
  message_content?: string; // The actual message content
  template_id?: string; // Twilio template ID if using templates
  latest_status: string; // Current message status
  status_history?: MessageStatusHistory[]; // Array of status changes
  error_code?: string; // Twilio error code if failed
  error_message?: string; // Twilio error message if failed
  sent_at?: string; // When message was sent
  last_updated?: string; // Last status update
  created_at?: string; // Record creation time
}

// Status history entry
export interface MessageStatusHistory {
  status: string;
  timestamp: string;
  error_code?: string;
  error_message?: string;
}

// Conversation interface for shared inbox
export interface Conversation {
  id?: number;
  phone_number: string; // Customer's phone number
  customer_name?: string; // Customer name (from orders if available)
  last_message_at?: string; // Timestamp of last message
  status?: "active" | "archived" | "blocked"; // Conversation status
  assigned_to?: string; // Agent assigned to conversation
  tags?: string[]; // Tags for categorization
  created_at?: string;
  updated_at?: string;
}

// Extended conversation with message details (for API responses)
export interface ConversationWithMessages extends Conversation {
  messages?: Message[];
  latest_message?: Message;
  unread_count?: number;
  order?: Order; // Associated order if available
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: string;
  count?: number;
}

export interface MessagesResponse extends ApiResponse {
  messages: Message[];
  count: number;
}

export interface ConversationsResponse extends ApiResponse {
  conversations: Conversation[];
  count: number;
}

export interface ConversationDetailsResponse extends ApiResponse {
  conversation: Conversation;
  messages: Message[];
  messageCount: number;
}

// Webhook payload from Twilio
export interface TwilioWebhookPayload {
  MessageSid: string;
  MessageStatus?: string;
  SmsStatus?: string;
  To: string;
  From: string;
  Timestamp?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
  AccountSid?: string;
  Body?: string;
}

// Message send request
export interface SendMessageRequest {
  to: string;
  message?: string;
  template_id?: string;
  template_variables?: Record<string, string>;
  tracking_number?: string;
  courier_company?: string;
}

interface SheetToDBMapping {
  [key: string]: string;
}

// Define mapping between Google Sheets columns and database fields
export const COLUMN_MAPPING: SheetToDBMapping = {
  no: "id",
  "order date": "order_date",
  fbname: "fb_name",
  name: "customer_name",
  "payment method": "payment_method",
  wash: "wash_qty",
  "femlift 30ml": "femlift_30ml_qty",
  "femlift 10ml": "femlift_10ml_qty",
  "wash 30ml": "wash_30ml_qty",
  spray: "spray_qty",
  remark: "remark",
  "package (rm)": "package_price",
  "postage (rm)": "postage",
  "total paid (rm)": "total_paid",
  "shipment description": "shipment_description",
  "phone number": "phone_number",
  "tracking number": "tracking_number",
  "courires company": "courier_company", // typo preserved from original
  "courier company": "courier_company", // correct spelling
  status: "status",
  "new/repeat": "new_or_repeat",
  "cash sale receipt": "cash_sale_receipt",
  "agent by / under": "agent_name",
  currency: "currency",
};

// Twilio message statuses
export enum MessageStatus {
  QUEUED = "queued",
  SENDING = "sending",
  SENT = "sent",
  DELIVERED = "delivered",
  READ = "read",
  FAILED = "failed",
  UNDELIVERED = "undelivered",
}

// Conversation statuses
export enum ConversationStatus {
  ACTIVE = "active",
  ARCHIVED = "archived",
  BLOCKED = "blocked",
}
