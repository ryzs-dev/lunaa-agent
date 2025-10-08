"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseSendService = void 0;
const axios_1 = __importDefault(require("axios"));
class SupabaseSendService {
    constructor() {
        const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
        this.businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '';
        this.businessPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
        if (!accessToken || !this.businessPhoneNumberId) {
            throw new Error('❌ Missing WhatsApp API credentials in .env');
        }
        this.client = axios_1.default.create({
            baseURL: `https://graph.facebook.com/v23.0`,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });
    }
    async sendTextMessage(to_number, body) {
        const response = await this.client.post(`/${this.businessPhoneNumberId}/messages`, {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to_number,
            type: 'text',
            text: { body },
        });
        return response.data;
    }
    async getMessageTemplates() {
        var _a;
        if (!this.businessAccountId) {
            throw new Error('Whatsapp Business Account ID is required');
        }
        try {
            const response = await this.client.get(`/${this.businessAccountId}/message_templates`);
            return response.data;
        }
        catch (error) {
            console.error('❌ Error fetching templates:', ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message);
            throw error;
        }
    }
    async sendTemplateMessage(to_number, templateName, parameters) {
        const response = await this.client.post(`/${this.businessPhoneNumberId}/messages`, {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to_number,
            type: 'template',
            template: {
                name: templateName,
                language: { code: 'zh_CN' },
                components: parameters ? [{ type: 'body', parameters }] : undefined,
            },
        });
        return response.data;
    }
}
exports.SupabaseSendService = SupabaseSendService;
