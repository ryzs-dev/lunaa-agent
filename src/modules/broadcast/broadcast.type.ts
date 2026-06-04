export type BroadcastDataInput = {
  name: string;
  template_name: string;
  template_id: string;
  segment_id: string;
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'cancelled';
  scheduled_at?: string;
};
