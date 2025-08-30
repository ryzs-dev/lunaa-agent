import axios, { AxiosInstance } from "axios";
import dotenv from "dotenv";
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

export class WhatsAppService {
  private client: AxiosInstance;
  private phoneNumberId: string;
  private businessAccountId: string;

  constructor() {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
    this.businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";

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
}
