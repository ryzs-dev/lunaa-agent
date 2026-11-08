import crypto from 'crypto';
import axios from 'axios';
import { getConverraConfig } from './converra-connection';

// Converra is the messaging server: every WhatsApp message goes out through it,
// so it lands in the thread with its delivery status.
type GraphStylePayload = {
  to: string;
  text?: { body: string };
  // Up to three reply buttons under the text.
  buttons?: { id: string; title: string }[];
  template?: {
    name: string;
    language?: { code?: string };
    components?: { type?: string; parameters?: { text?: string }[] }[] | unknown;
  };
};

export function converraBody(payload: GraphStylePayload, idempotencyKey?: string) {
  const key = idempotencyKey ?? crypto.randomUUID();
  if (payload.template) {
    const components = Array.isArray(payload.template.components) ? payload.template.components : [];
    const body = components.find((component: any) => component?.type?.toLowerCase() === 'body');
    return {
      to: payload.to,
      idempotency_key: key,
      template: {
        name: payload.template.name,
        language: payload.template.language?.code,
        variables: (body?.parameters ?? []).map((parameter: { text?: string }) => parameter.text ?? ''),
      },
    };
  }
  return {
    to: payload.to,
    idempotency_key: key,
    text: payload.text?.body ?? '',
    ...(payload.buttons?.length ? { buttons: payload.buttons } : {}),
  };
}

export async function sendThroughConverra(payload: GraphStylePayload, idempotencyKey?: string) {
  const config = await getConverraConfig();
  if (!config) throw new Error('Converra is not connected');
  const { data } = await axios.post(
    `${config.baseUrl}/integrations/${config.businessId}/messages`,
    converraBody(payload, idempotencyKey),
    { headers: { 'X-Bridge-Key': config.apiKey }, timeout: 30000 }
  );
  return { data: { messages: [{ id: data.provider_message_id, message_status: data.status }] } };
}
