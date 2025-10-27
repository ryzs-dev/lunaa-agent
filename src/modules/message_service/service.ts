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
