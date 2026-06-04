import { message_service } from '.';

export class MessageService {
  async getMessages() {
    try {
      const { data } = await message_service.get(
        '/api/conversations/messages',
        {}
      );
      return data;
    } catch (error) {
      console.error('Error fetching messages:', error);
      throw error;
    }
  }

  async sendTextMessage(to_number: string, body: string) {
    if (!to_number || !body) {
      throw new Error('❌ to_number and body are required to send a message');
    }

    try {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to_number,
        type: 'text',
        text: {
          body,
        },
      };

      const { data } = await message_service.post(
        '/api/conversations/messages',
        payload
      );

      return data;
    } catch (error: any) {
      console.error('Error sending message: ', {
        to_number,
        body,
        error: error?.response?.data || error.message,
      });

      throw new Error('Failed to send WhatsApp message');
    }
  }

  async sendTemplate({ to, templateName, languageCode = 'en' }: any) {
    try {
      const { data } = await message_service.post(
        '/api/conversations/template',
        {
          to,
          templateName,
          languageCode,
        }
      );
      return data;
    } catch (error) {
      console.error('Error fetching conversations:', error);
      throw error;
    }
  }

  async getConversations() {
    try {
      const { data } = await message_service.get('/api/conversations', {});
      return data;
    } catch (error) {
      console.error('Error fetching conversations:', error);
      throw error;
    }
  }

  async getConversationById(conversationId: number) {
    try {
      const { data } = await message_service.get(
        `/api/conversations/${conversationId}`,
        {}
      );
      return data;
    } catch (error) {
      console.error('Error fetching conversation by ID:', error);
      throw error;
    }
  }

  async getMessagesByConversationId(conversationId: number) {
    try {
      const { data } = await message_service.get(
        `/api/conversations/${conversationId}/messages`,
        {}
      );
      return data;
    } catch (error) {
      console.error('Error fetching messages by conversation ID:', error);
      throw error;
    }
  }

  async getMessageByWamid(wamid: string) {
    try {
      const { data } = await message_service.get(`/api/messages/${wamid}`, {});
      return data;
    } catch (error) {
      console.error('Error fetching message by WAMID:', error);
      throw error;
    }
  }
}
