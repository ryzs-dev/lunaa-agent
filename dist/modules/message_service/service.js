"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageService = void 0;
const _1 = require(".");
class MessageService {
    async getMessages() {
        try {
            const { data } = await _1.message_service.get('/api/conversations/messages', {});
            return data;
        }
        catch (error) {
            console.error('Error fetching messages:', error);
            throw error;
        }
    }
    async sendTextMessage(to_number, body) {
        var _a;
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
            const { data } = await _1.message_service.post('/api/conversations/messages', payload);
            return data;
        }
        catch (error) {
            console.error('Error sending message: ', {
                to_number,
                body,
                error: ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message,
            });
            throw new Error('Failed to send WhatsApp message');
        }
    }
    async getConversations() {
        try {
            const { data } = await _1.message_service.get('/api/conversations', {});
            return data;
        }
        catch (error) {
            console.error('Error fetching conversations:', error);
            throw error;
        }
    }
    async getConversationById(conversationId) {
        try {
            const { data } = await _1.message_service.get(`/api/conversations/${conversationId}`, {});
            return data;
        }
        catch (error) {
            console.error('Error fetching conversation by ID:', error);
            throw error;
        }
    }
    async getMessagesByConversationId(conversationId) {
        try {
            const { data } = await _1.message_service.get(`/api/conversations/${conversationId}/messages`, {});
            return data;
        }
        catch (error) {
            console.error('Error fetching messages by conversation ID:', error);
            throw error;
        }
    }
    async getMessageByWamid(wamid) {
        try {
            const { data } = await _1.message_service.get(`/api/messages/${wamid}`, {});
            return data;
        }
        catch (error) {
            console.error('Error fetching message by WAMID:', error);
            throw error;
        }
    }
}
exports.MessageService = MessageService;
