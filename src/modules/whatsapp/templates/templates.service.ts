import axios from 'axios';
import {
  SendTemplateInput,
  SendTemplateParams,
  TemplateComponent,
  TemplateRequestType,
} from './templates.type';

const API_VERSION = 'v24.0';

export class WhatsappTemplatesService {
  private baseUrl = `https://graph.facebook.com/${API_VERSION}`;
  private accessToken = process.env.WHATSAPP_ACCESS_TOKEN!;
  private wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!;
  private phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;

  private metaClient = axios.create({
    baseURL: this.baseUrl,
    headers: {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  private toMetaPayload(template: TemplateRequestType) {
    return {
      name: template.name,
      language: template.language,
      category: template.category,
      parameter_format: template.parameter_format ?? 'POSITIONAL',

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
                      url: b.url!,
                    };

                  case 'PHONE_NUMBER':
                    return {
                      type: 'phone_number',
                      text: b.text,
                      phone_number: b.phone_number!,
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
            throw new Error(`Unsupported component type: ${(c as any).type}`);
        }
      }),
    };
  }

  async getAllTemplates() {
    let allTemplates: any[] = [];
    let nextUrl = `/${this.wabaId}/message_templates`;

    while (nextUrl) {
      const { data } = await this.metaClient.get(nextUrl);

      allTemplates = [...allTemplates, ...data.data];

      const after = data.paging?.cursors?.after;

      if (after) {
        nextUrl = `/${this.wabaId}/message_templates?after=${after}`;
      } else {
        nextUrl = '';
      }
    }

    return allTemplates;
  }

  async getTemplateById(templateId: string) {
    try {
      const { data } = await this.metaClient.get(`/${templateId}`);

      return data;
    } catch (error: any) {
      console.error(
        'Get template by ID failed:',
        error?.response?.data || error.message
      );

      throw new Error(
        error?.response?.data?.error?.message || 'Failed to get template by ID'
      );
    }
  }

  async createTemplate(templateData: TemplateRequestType) {
    try {
      const payload = this.toMetaPayload(templateData);

      const { data } = await this.metaClient.post(
        `/${this.wabaId}/message_templates`,
        payload
      );

      return data;
    } catch (error: any) {
      console.error(
        'Create template failed:',
        error?.response?.data || error.message
      );

      throw new Error(
        error?.response?.data?.error?.message || 'Failed to create template'
      );
    }
  }

  async deleteTemplate(params: { name?: string; hsm_id?: string }) {
    try {
      if (!params.name && !params.hsm_id) {
        throw new Error('Either name or hsm_id is required to delete template');
      }

      const { data } = await this.metaClient.delete(
        `/${this.wabaId}/message_templates`,
        {
          params: {
            ...(params.name && { name: params.name }),
            ...(params.hsm_id && { hsm_id: params.hsm_id }),
          },
        }
      );

      return data;
    } catch (error: any) {
      console.error(
        'Delete template failed:',
        error?.response?.data || error.message
      );

      throw new Error(
        error?.response?.data?.error?.message || 'Failed to delete template'
      );
    }
  }

  async sendTemplate(input: SendTemplateInput) {
    const { to, templateName, variables = [], language = 'en_US' } = input;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        ...(variables.length > 0 && {
          components: [
            {
              type: 'body',
              parameters: variables.map((v) => ({
                type: 'text',
                text: v,
              })),
            },
          ],
        }),
      },
    };

    try {
      const response = await this.metaClient.post(
        `/${this.phoneNumberId}/messages`,
        payload
      );

      console.log('✅ WhatsApp sent:', response.data);
      return response.data;
    } catch (error: any) {
      console.error(
        '❌ WhatsApp send failed:',
        error?.response?.data || error.message
      );
      throw error;
    }
  }
}
