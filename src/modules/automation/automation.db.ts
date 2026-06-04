import { UUID } from 'crypto';
import { supabase } from '../supabase';
import { AutomationDataInput } from './automation.type';

export class AutomationDB {
  async createAutomation(automationData: AutomationDataInput) {
    const {
      name,
      description,
      trigger_event,
      delay_seconds = 0,
      is_active = true,
      actions,
    } = automationData;

    if (!actions || actions.length === 0) {
      throw new Error('Automation must have at least one action');
    }

    const { data: automation, error: automationError } = await supabase
      .from('automations')
      .insert({
        name,
        description,
        trigger_event,
        delay_seconds,
        is_active,
      })
      .select()
      .single();

    if (automationError || !automation) {
      throw new Error(
        automationError?.message || 'Failed to create automation'
      );
    }

    const actionsPayload = actions.map((action, index) => ({
      automation_id: automation.id,
      type: action.type,
      config: action.config,
      order: index,
    }));

    const { error: actionsError } = await supabase
      .from('automation_actions')
      .insert(actionsPayload);

    if (actionsError) {
      await supabase.from('automations').delete().eq('id', automation.id);

      throw new Error(
        actionsError.message || 'Failed to create automation actions'
      );
    }

    return {
      ...automation,
      actions,
    };
  }

  async getAutomations() {
    const { data, error } = await supabase
      .from('automations')
      .select(
        `
      *,
      automation_actions (*)
    `
      )
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async getAutomationsById(automationId: UUID) {
    const { data, error } = await supabase
      .from('automations')
      .select(`*, automation_actions (*)`)
      .eq('id', automationId)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async toggleAutomation(automationId: UUID, is_active: boolean) {
    const { data, error } = await supabase
      .from('automations')
      .update({ is_active, updated_at: new Date().toISOString() })
      .eq('id', automationId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async updateAutomation(
    automationId: UUID,
    updateData: Partial<AutomationDataInput>
  ) {
    const { data, error } = await supabase
      .from('automations')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', automationId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }
}
