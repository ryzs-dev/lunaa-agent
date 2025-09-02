import axios, { AxiosInstance } from "axios";
import dotenv from "dotenv";
import { Request, Response } from "express";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

interface TemplateLanguage {
  code: string;
}

interface TemplatePayload {
  name: string;
  language: TemplateLanguage;
  variables?: { [key: string]: string };
  components?: any[];
}

type Message = {
  from: string;
  to?: string;
  type: string;
  body?: string;
  timestamp: string;
  id?: string;
  direction: string;
};

type Contact = {
  waId: string;
  profileName: string;
};

export class WhatsAppService {
  private client: AxiosInstance;
  private phoneNumberId: string;
  private businessAccountId: string;
  private messages: Message[] = [];
  private contacts: Contact[] = [];

  constructor() {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
    this.businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";
    this.messages = [];
    this.contacts = [];

    if (!accessToken || !this.phoneNumberId) {
      throw new Error("❌ Missing WhatsApp API credentials in .env");
    }

    this.client = axios.create({
      baseURL: `https://graph.facebook.com/v23.0`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  /** Send a plain text message */
  async sendTextMessage(to: string, message: string) {
    try {
      console.log("Sending text message to:", to);
      const response = await this.client.post(
        `/${this.phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: message },
        }
      );

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
    } catch (error: any) {
      console.error(
        "❌ Error sending text:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /** Send a template message */
  async sendTemplateMessage(
    to: string,
    template: {
      name: string;
      language: { code: string };
      components: [type: string, parameters?: { type?: string; text?: string }];
    }
  ) {
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

      const response = await this.client.post(
        `/${this.phoneNumberId}/messages`,
        payload
      );

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
    } catch (error: any) {
      //   console.error(
      //     "❌ Error sending template:",
      //     error.response?.data || error.message
      //   );

      throw error;
    }
  }

  /** Get available message templates */
  async getMessageTemplates() {
    try {
      const response = await this.client.get(
        `/${this.businessAccountId}/message_templates`
      );

      console.log("✅ Fetched templates:", response.data);
      return response.data;
    } catch (error: any) {
      console.error(
        "❌ Error fetching templates:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  saveMessage(msg: Message) {
    this.messages.push(msg);
  }

  getMessages() {
    return this.messages;
  }

  saveContact(contact: Contact) {
    // Check if contact already exists by waId
    const exists = this.contacts.find((c) => c.waId === contact.waId);
    if (!exists) {
      this.contacts.push(contact);
      console.log("📇 Saved Contact:", contact);
    } else {
      console.log("⚠️ Contact already exists:", contact.waId);
    }
  }

  getContacts() {
    return this.contacts;
  }
}
