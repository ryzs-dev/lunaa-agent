import axios from 'axios';

export const GRAPH = 'https://graph.facebook.com/v25.0';

// Meta's own error text ("Invalid OAuth access token", "Unsupported get request")
// is what staff need to fix the connection, so surface it as-is.
export function graphError(error: any): string {
  const meta = error?.response?.data?.error;
  if (meta?.message) return meta.error_user_msg || meta.message;
  return error?.message ?? 'Meta request failed';
}

export async function graphGet<T = any>(path: string, token: string, params: Record<string, any> = {}) {
  const { data } = await axios.get<T>(path.startsWith('http') ? path : `${GRAPH}/${path}`, {
    params: path.startsWith('http') ? undefined : { ...params, access_token: token },
    timeout: 30000,
  });
  return data;
}

export async function graphPost<T = any>(path: string, token: string, body: Record<string, any>) {
  const { data } = await axios.post<T>(`${GRAPH}/${path}`, body, {
    params: { access_token: token },
    timeout: 30000,
  });
  return data;
}

export function normaliseAccountId(input: string) {
  const digits = input.trim().replace(/^act_/i, '').replace(/\D/g, '');
  return digits ? `act_${digits}` : '';
}
