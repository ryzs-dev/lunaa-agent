/**
 * Forwards normalized events from lunaa-agent to Converra's integration gateway.
 *
 * Converra endpoint:
 *   POST /api/v1/integrations/:business_id/events/lunaa-agent
 *   X-Bridge-Key: <CONVERRA_BRIDGE_API_KEY>
 */

export interface LunaaEventInput {
  event_type: string;
  external_event_id: string;
  business_id: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

function getConverraConfig(): {
  baseUrl: string;
  businessId: string;
  apiKey: string;
} | null {
  const baseUrl = process.env.CONVERRA_API_URL?.trim();
  const businessId = process.env.CONVERRA_BUSINESS_ID?.trim();
  const apiKey = process.env.CONVERRA_BRIDGE_API_KEY?.trim();

  if (!baseUrl || !businessId || !apiKey) {
    console.warn(
      '[ConverraForwarder] Missing CONVERRA_API_URL, CONVERRA_BUSINESS_ID, or CONVERRA_BRIDGE_API_KEY — skipping forward',
    );
    return null;
  }

  return { baseUrl, businessId, apiKey };
}

export async function forwardToConverra(input: LunaaEventInput): Promise<{
  success: boolean;
  event_id?: string;
  duplicate?: boolean;
  error?: string;
}> {
  const config = getConverraConfig();
  if (!config) {
    return { success: false, error: 'Converra config missing' };
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

    const result = (await response.json()) as {
      success?: boolean;
      duplicate?: boolean;
      event_id?: string;
      error?: string;
    };

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
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ConverraForwarder] Failed to forward event:', message);
    return { success: false, error: message };
  }
}
