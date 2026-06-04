import { supabase } from '../supabase';
import { BroadcastDataInput } from './broadcast.type';

export class BroadcastDB {
  async createBroadcast(broadcastData: BroadcastDataInput) {
    const {
      name,
      template_id,
      template_name,
      status,
      segment_id,
      scheduled_at,
    } = broadcastData;

    const { data: broadcast, error: broadcastError } = await supabase
      .from('broadcasts')
      .insert({
        name,
        template_name,
        template_id,
        segment_id,
        status,
        scheduled_at,
      })
      .select()
      .single();

    if (broadcastError || !broadcast) {
      throw new Error(broadcastError?.message || 'Failed to create broadcast');
    }

    return broadcast;
  }

  async getBroadcasts() {
    const { data, error } = await supabase.from('broadcasts').select('*');

    if (error) {
      throw new Error(`Failed to fetch broadcasts: ${error.message}`);
    }

    return data;
  }

  async getBroadcastById(broadcastId: string) {
    const { data, error } = await supabase
      .from('broadcasts')
      .select(
        `
    *,
    segment:segments (
      id,
      name,

      members:segment_members (
        user_id:customers(
          name,
          phone_number
        )
      )
    )
  `
      )
      .eq('id', broadcastId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch broadcast: ${error.message}`);
    }

    return data;
  }

  async deleteBroadcastById(broadcastId: string) {
    const { data, error } = await supabase
      .from('broadcasts')
      .delete()
      .eq('id', broadcastId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch broadcast: ${error.message}`);
    }

    return data;
  }
}
