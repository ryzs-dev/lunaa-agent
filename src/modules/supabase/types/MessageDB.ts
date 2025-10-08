import { UUID } from 'crypto';

export interface MessagesDB {
  id: UUID;
  message_id: string;
  direction: 'inbound' | 'outbound';
  from_number: string;
  to_number: string;
  type: string;
  body: string;
  timestamp: string;
  metadata?: [];
  created_at?: string;
  conversation_id?: string;
}

export interface ConversationsDB {
  id: UUID;
  contact_wa_id: string;
  business_number: string;
  status: 'open';
  last_message?: string;
  unread_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface MessageMediaDB {
  id: UUID;
  message_id: UUID;
  media_id: string;
  mime_type?: string;
  caption?: string;
  created_at?: string;
}
