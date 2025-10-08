import { SupabaseSendService } from '../../supabase/services/SendService';
import { TemplateMessagePayload } from '../types';

export class WhatsappSendService {
  private supabaseSendService: SupabaseSendService;

  constructor() {
    this.supabaseSendService = new SupabaseSendService();
  }

  async sendTextMessage(to_number: string, body: string) {
    if (!to_number || !body) {
      throw new Error('❌ to_number and body are required to send a message');
    }
    return this.supabaseSendService.sendTextMessage(to_number, body);
  }

  async getMessageTemplates() {
    return this.supabaseSendService.getMessageTemplates();
  }

  async sendTemplateMessage(templateMessagePayload: TemplateMessagePayload) {
    if (
      !templateMessagePayload.to_number ||
      !templateMessagePayload.template_name
    ) {
      throw new Error(
        '❌ to_number and templateName are required to send a template message'
      );
    }

    // Transform plain object parameters into WhatsApp format
    const formattedParameters = Object.values(
      templateMessagePayload.parameters
    ).map((value) => ({
      type: 'text',
      text: value,
    }));


    return this.supabaseSendService.sendTemplateMessage(
      templateMessagePayload.to_number,
      templateMessagePayload.template_name,
      formattedParameters
    );
  }

  async sendBulkTemplateMessages(
    templateMessagePayload: TemplateMessagePayload[]
  ) {
    {
      const results = await Promise.allSettled(
        templateMessagePayload.map((payload) =>
          this.sendTemplateMessage(payload)
        )
      );
      return results.map((r) =>
        r.status === 'fulfilled' ? r.value : r.reason
      );
    }
  }
}
