"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutomationDB = void 0;
const supabase_1 = require("../supabase");
class AutomationDB {
    async createAutomation(automationData) {
        const { name, description, trigger_event, delay_seconds = 0, is_active = true, actions, } = automationData;
        if (!actions || actions.length === 0) {
            throw new Error('Automation must have at least one action');
        }
        const { data: automation, error: automationError } = await supabase_1.supabase
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
            throw new Error((automationError === null || automationError === void 0 ? void 0 : automationError.message) || 'Failed to create automation');
        }
        const actionsPayload = actions.map((action, index) => ({
            automation_id: automation.id,
            type: action.type,
            config: action.config,
            order: index,
        }));
        const { error: actionsError } = await supabase_1.supabase
            .from('automation_actions')
            .insert(actionsPayload);
        if (actionsError) {
            await supabase_1.supabase.from('automations').delete().eq('id', automation.id);
            throw new Error(actionsError.message || 'Failed to create automation actions');
        }
        return Object.assign(Object.assign({}, automation), { actions });
    }
    async getAutomations() {
        const { data, error } = await supabase_1.supabase
            .from('automations')
            .select(`
      *,
      automation_actions (*)
    `)
            .order('created_at', { ascending: false });
        if (error) {
            throw new Error(error.message);
        }
        return data;
    }
    async getAutomationsById(automationId) {
        const { data, error } = await supabase_1.supabase
            .from('automations')
            .select(`*, automation_actions (*)`)
            .eq('id', automationId)
            .single();
        if (error) {
            throw new Error(error.message);
        }
        return data;
    }
    async toggleAutomation(automationId, is_active) {
        const { data, error } = await supabase_1.supabase
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
    async updateAutomation(automationId, updateData) {
        const { data, error } = await supabase_1.supabase
            .from('automations')
            .update(Object.assign(Object.assign({}, updateData), { updated_at: new Date().toISOString() }))
            .eq('id', automationId)
            .select()
            .single();
        if (error) {
            throw new Error(error.message);
        }
        return data;
    }
}
exports.AutomationDB = AutomationDB;
