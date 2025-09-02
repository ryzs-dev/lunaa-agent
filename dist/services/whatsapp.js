"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppService = void 0;
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../../.env.local") });
class WhatsAppService {
    constructor() {
        this.messages = [];
        this.contacts = [];
        const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
        this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
        this.businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";
        this.messages = [];
        this.contacts = [];
        if (!accessToken || !this.phoneNumberId) {
            throw new Error("❌ Missing WhatsApp API credentials in .env");
        }
        this.client = axios_1.default.create({
            baseURL: `https://graph.facebook.com/v23.0`,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });
    }
    /** Send a plain text message */
    sendTextMessage(to, message) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                console.log("Sending text message to:", to);
                const response = yield this.client.post(`/${this.phoneNumberId}/messages`, {
                    messaging_product: "whatsapp",
                    to,
                    type: "text",
                    text: { body: message },
                });
                // Save outbound message in DB
                this.saveMessage({
                    from: this.phoneNumberId, // your business phone number
                    to,
                    type: "text",
                    body: message, // optional, you can also stringify template.components
                    timestamp: Date.now().toString(),
                    direction: "outbound",
                });
                console.log("✅ Text message sent:", response.data);
                return response.data;
            }
            catch (error) {
                console.error("❌ Error sending text:", ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message);
                throw error;
            }
        });
    }
    /** Send a template message */
    sendTemplateMessage(to, template) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const components = template.components;
                console.log("Template components:", components);
                const payload = {
                    messaging_product: "whatsapp",
                    to,
                    type: "template",
                    template: {
                        name: template.name,
                        language: { code: template.language.code },
                        components,
                    },
                };
                const response = yield this.client.post(`/${this.phoneNumberId}/messages`, payload);
                // Save outbound message in DB
                //   this.saveMessage({
                //     from: this.phoneNumberId, // your business phone number
                //     to,
                //     type: "template",
                //     text: template, // optional, you can also stringify template.components
                //     timestamp: Date.now().toString(),
                //     direction: "outbound",
                //   });
                return response.data;
            }
            catch (error) {
                //   console.error(
                //     "❌ Error sending template:",
                //     error.response?.data || error.message
                //   );
                throw error;
            }
        });
    }
    /** Get available message templates */
    getMessageTemplates() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                const response = yield this.client.get(`/${this.businessAccountId}/message_templates`);
                console.log("✅ Fetched templates:", response.data);
                return response.data;
            }
            catch (error) {
                console.error("❌ Error fetching templates:", ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message);
                throw error;
            }
        });
    }
    saveMessage(msg) {
        this.messages.push(msg);
    }
    getMessages() {
        return this.messages;
    }
    saveContact(contact) {
        // Check if contact already exists by waId
        const exists = this.contacts.find((c) => c.waId === contact.waId);
        if (!exists) {
            this.contacts.push(contact);
            console.log("📇 Saved Contact:", contact);
        }
        else {
            console.log("⚠️ Contact already exists:", contact.waId);
        }
    }
    getContacts() {
        return this.contacts;
    }
}
exports.WhatsAppService = WhatsAppService;
