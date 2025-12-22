export interface OrderTrackingInput {
  tracking_number: string;
  courier: string;
  status: string;
  message_status: string;
  last_message_sent_at: string | null;
}
