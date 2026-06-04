"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsappTemplatesService = void 0;
const axios_1 = __importDefault(require("axios"));
const API_VERSION = 'v24.0';
class WhatsappTemplatesService {
    constructor() {
        this.baseUrl = `https://graph.facebook.com/${API_VERSION}`;
        this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
        this.wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
        this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        this.metaClient = axios_1.default.create({
            baseURL: this.baseUrl,
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
            },
        });
    }
    toMetaPayload(template) {
        var _a;
        return {
            name: template.name,
            language: template.language,
            category: template.category,
            parameter_format: (_a = template.parameter_format) !== null && _a !== void 0 ? _a : 'POSITIONAL',
            components: template.components.map((c) => {
                switch (c.type) {
                    case 'BODY':
                        return {
                            type: 'BODY',
                            text: c.text,
                        };
                    case 'HEADER':
                        if (c.format === 'TEXT') {
                            return {
                                type: 'HEADER',
                                format: 'TEXT',
                                text: c.text,
                            };
                        }
                        return {
                            type: 'HEADER',
                            format: c.format,
                            example: c.example,
                        };
                    case 'FOOTER':
                        return {
                            type: 'FOOTER',
                            text: c.text,
                        };
                    case 'BUTTONS':
                        return {
                            type: 'BUTTONS',
                            buttons: c.buttons.map((b) => {
                                switch (b.type) {
                                    case 'URL':
                                        return {
                                            type: 'url',
                                            text: b.text,
                                            url: b.url,
                                        };
                                    case 'PHONE_NUMBER':
                                        return {
                                            type: 'phone_number',
                                            text: b.text,
                                            phone_number: b.phone_number,
                                        };
                                    case 'FLOW':
                                        return {
                                            type: 'flow',
                                            text: b.text,
                                            flow_action: b.flow_action,
                                            navigate_screen: b.navigate_screen,
                                        };
                                    case 'COPY_CODE':
                                        return {
                                            type: 'copy_code',
                                            example: b.example,
                                        };
                                    case 'QUICK_REPLY':
                                    default:
                                        return {
                                            type: 'quick_reply',
                                            text: b.text,
                                        };
                                }
                            }),
                        };
                    default:
                        // ⚠️ compile-time safety fallback (should never hit)
                        throw new Error(`Unsupported component type: ${c.type}`);
                }
            }),
        };
    }
    async getAllTemplates() {
        var _a, _b;
        let allTemplates = [];
        let nextUrl = `/${this.wabaId}/message_templates`;
        while (nextUrl) {
            const { data } = await this.metaClient.get(nextUrl);
            allTemplates = [...allTemplates, ...data.data];
            const after = (_b = (_a = data.paging) === null || _a === void 0 ? void 0 : _a.cursors) === null || _b === void 0 ? void 0 : _b.after;
            if (after) {
                nextUrl = `/${this.wabaId}/message_templates?after=${after}`;
            }
            else {
                nextUrl = '';
            }
        }
        return allTemplates;
    }
    async getTemplateById(templateId) {
        var _a, _b, _c, _d;
        try {
            const { data } = await this.metaClient.get(`/${templateId}`);
            return data;
        }
        catch (error) {
            console.error('Get template by ID failed:', ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message);
            throw new Error(((_d = (_c = (_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.error) === null || _d === void 0 ? void 0 : _d.message) || 'Failed to get template by ID');
        }
    }
    async createTemplate(templateData) {
        var _a, _b, _c, _d;
        try {
            const payload = this.toMetaPayload(templateData);
            const { data } = await this.metaClient.post(`/${this.wabaId}/message_templates`, payload);
            return data;
        }
        catch (error) {
            console.error('Create template failed:', ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message);
            throw new Error(((_d = (_c = (_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.error) === null || _d === void 0 ? void 0 : _d.message) || 'Failed to create template');
        }
    }
    async deleteTemplate(params) {
        var _a, _b, _c, _d;
        try {
            if (!params.name && !params.hsm_id) {
                throw new Error('Either name or hsm_id is required to delete template');
            }
            const { data } = await this.metaClient.delete(`/${this.wabaId}/message_templates`, {
                params: Object.assign(Object.assign({}, (params.name && { name: params.name })), (params.hsm_id && { hsm_id: params.hsm_id })),
            });
            return data;
        }
        catch (error) {
            console.error('Delete template failed:', ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message);
            throw new Error(((_d = (_c = (_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.error) === null || _d === void 0 ? void 0 : _d.message) || 'Failed to delete template');
        }
    }
    async sendTemplate(input) {
        var _a;
        const { to, templateName, variables = [], language = 'en_US' } = input;
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'template',
            template: Object.assign({ name: templateName, language: { code: language } }, (variables.length > 0 && {
                components: [
                    {
                        type: 'body',
                        parameters: variables.map((v) => ({
                            type: 'text',
                            text: v,
                        })),
                    },
                ],
            })),
        };
        try {
            const response = await this.metaClient.post(`/${this.phoneNumberId}/messages`, payload);
            console.log('✅ WhatsApp sent:', response.data);
            return response.data;
        }
        catch (error) {
            console.error('❌ WhatsApp send failed:', ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message);
            throw error;
        }
    }
}
exports.WhatsappTemplatesService = WhatsappTemplatesService;
