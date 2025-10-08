import axios, { AxiosInstance } from 'axios';
import { MessagesDB } from '../types/MessageDB';

export class SupabaseSendService {
  private client: AxiosInstance;
  private businessPhoneNumberId: string;
  private businessAccountId: string;

  constructor() {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '';

    this.businessPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

    if (!accessToken || !this.businessPhoneNumberId) {
      throw new Error('❌ Missing WhatsApp API credentials in .env');
    }

    this.client = axios.create({
      baseURL: `https://graph.facebook.com/v23.0`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async sendTextMessage(to_number: string, body: string) {
    const response = await this.client.post(
      `/${this.businessPhoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to_number,
        type: 'text',
        text: { body },
      }
    );
    return response.data;
  }

  async getMessageTemplates() {
    if (!this.businessAccountId) {
      throw new Error('Whatsapp Business Account ID is required');
    }
    try {
      const response = await this.client.get(
        `/${this.businessAccountId}/message_templates`
      );

      return response.data;
    } catch (error: any) {
      console.error(
        '❌ Error fetching templates:',
        error.response?.data || error.message
      );
      throw error;
    }
  }

  async sendTemplateMessage(
    to_number: string,
    templateName: string,
    parameters?: any[]
  ) {
    const response = await this.client.post(
      `/${this.businessPhoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to_number,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'zh_CN' },
          components: parameters ? [{ type: 'body', parameters }] : undefined,
        },
      }
    );
    return response.data;
  }
}
