/**
 * Forwards normalized events from lunaa-agent to Converra's integration gateway.
 *
 * Converra endpoint:
 *   POST /api/v1/integrations/:business_id/events/lunaa-agent
 *   X-Bridge-Key: <access key of the stored connection, or legacy CONVERRA_BRIDGE_API_KEY>
 *
 * Credentials come from the connection resolver (converra-connection.ts).
 */

import { getConverraConfig } from './converra-connection';
import { ConverraConfig } from './converra-config';

export interface LunaaEventInput {
  event_type: string;
  external_event_id: string;
  /** Ignored — the business id always comes from the resolved connection. */
  business_id?: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export async function forwardToConverra(
  input: LunaaEventInput,
  /** Pin the connection for multi-request jobs (full sync); resolved per call otherwise. */
  configOverride?: ConverraConfig,
): Promise<{
  success: boolean;
  event_id?: string;
  duplicate?: boolean;
  error?: string;
  /** Full Converra response (e.g. created / updated / failed counts for customer syncs). */
  response?: Record<string, unknown>;
}> {
  let config: ConverraConfig | null;
  try {
    config = configOverride ?? (await getConverraConfig());
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!config) {
    return { success: false, error: 'Converra is not connected' };
  }

  const { baseUrl, businessId, apiKey } = config;

  const body = {
    event_type: input.event_type,
    external_source: 'lunaa-agent',
    business_id: businessId,
    external_event_id: input.external_event_id,
    timestamp: input.timestamp,
    payload: input.payload,
  };

  try {
    const response = await fetch(
      `${baseUrl}/integrations/${businessId}/events/lunaa-agent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Key': apiKey,
        },
        body: JSON.stringify(body),
      },
    );

    const result = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      duplicate?: boolean;
      event_id?: string;
      error?: string;
    } & Record<string, unknown>;

    if (!response.ok) {
      console.error('[ConverraForwarder] Converra rejected event:', {
        status: response.status,
        result,
        event_type: input.event_type,
      });
      return { success: false, error: JSON.stringify(result) };
    }

    console.log('[ConverraForwarder] Forwarded to Converra:', {
      event_type: input.event_type,
      external_event_id: input.external_event_id,
      event_id: result.event_id,
      duplicate: result.duplicate ?? false,
    });

    return {
      success: true,
      event_id: result.event_id,
      duplicate: result.duplicate ?? false,
      response: result,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ConverraForwarder] Failed to forward event:', message);
    return { success: false, error: message };
  }
}

/**
 * Calls Converra's connection endpoint for this business with the bridge key
 * (GET = who/what is connected, DELETE = revoke the key).
 */
export async function callConverraConnection(
  config: ConverraConfig,
  method: 'GET' | 'DELETE',
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${config.baseUrl}/integrations/${config.businessId}/connection`, {
    method,
    headers: { 'X-Bridge-Key': config.apiKey },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, body };
}
