import {
  buildAuthorizeUrl,
  ConverraConnectionRow,
  customerMatchesSegmentFilter,
  parseSettingsPatch,
  resolveConverraConfig,
  syncSettingsFromRow,
  validateOAuthState,
} from '../converra-config';

const ENV = {
  CONVERRA_API_URL: 'https://api.converra.app/api/v1/',
  CONVERRA_BUSINESS_ID: 'env-business',
  CONVERRA_BRIDGE_API_KEY: 'env-key',
};

function row(overrides: Partial<ConverraConnectionRow> = {}): ConverraConnectionRow {
  return {
    business_id: null,
    workspace_name: null,
    access_key: null,
    api_base_url: null,
    connected_by: null,
    connected_at: null,
    auto_sync: null,
    sync_segments: null,
    sync_email: null,
    segment_ids: null,
    oauth_state: null,
    oauth_state_expires_at: null,
    disconnected_at: null,
    ...overrides,
  };
}

const connected = row({
  business_id: 'oauth-business',
  workspace_name: 'Lunaa',
  access_key: 'cvk_abc',
  api_base_url: 'https://api.example.com/api/v1',
  connected_by: 'ryan@example.com',
  connected_at: '2026-10-23T00:00:00.000Z',
});

describe('resolveConverraConfig', () => {
  it('uses the env connection while there is no row', () => {
    expect(resolveConverraConfig(null, ENV)).toMatchObject({
      source: 'env',
      baseUrl: 'https://api.converra.app/api/v1',
      businessId: 'env-business',
      apiKey: 'env-key',
    });
  });

  it('returns null when neither a row nor complete env exists', () => {
    expect(resolveConverraConfig(null, {})).toBeNull();
    expect(resolveConverraConfig(null, { ...ENV, CONVERRA_BRIDGE_API_KEY: ' ' })).toBeNull();
  });

  it('prefers a connected row over env', () => {
    expect(resolveConverraConfig(connected, ENV)).toEqual({
      source: 'oauth',
      baseUrl: 'https://api.example.com/api/v1',
      businessId: 'oauth-business',
      apiKey: 'cvk_abc',
      workspaceName: 'Lunaa',
      connectedBy: 'ryan@example.com',
      connectedAt: '2026-10-23T00:00:00.000Z',
    });
  });

  it('falls back to CONVERRA_API_URL when the row has no api_base_url', () => {
    expect(resolveConverraConfig({ ...connected, api_base_url: null }, ENV)?.baseUrl).toBe(
      'https://api.converra.app/api/v1',
    );
  });

  it('a disconnected row disables the env connection', () => {
    const disconnected = { ...connected, access_key: null, disconnected_at: '2026-10-23T01:00:00.000Z' };
    expect(resolveConverraConfig(disconnected, ENV)).toBeNull();
  });

  it('a row with only an OAuth state or settings does not override env', () => {
    const pending = row({ oauth_state: 'abc', oauth_state_expires_at: '2026-10-23T01:00:00.000Z', auto_sync: false });
    expect(resolveConverraConfig(pending, ENV)?.source).toBe('env');
  });
});

describe('syncSettingsFromRow / parseSettingsPatch', () => {
  it('defaults to sync everything', () => {
    expect(syncSettingsFromRow(null)).toEqual({ autoSync: true, syncSegments: true, syncEmail: true, segmentIds: null });
  });

  it('maps a valid patch to columns', () => {
    expect(parseSettingsPatch({ autoSync: false, segmentIds: ['a', 'a', 'b'] })).toEqual({
      ok: true,
      columns: { auto_sync: false, segment_ids: ['a', 'b'] },
    });
    expect(parseSettingsPatch({ segmentIds: null })).toEqual({ ok: true, columns: { segment_ids: null } });
  });

  it('rejects bad patches', () => {
    expect(parseSettingsPatch({ autoSync: 'yes' }).ok).toBe(false);
    expect(parseSettingsPatch({ segmentIds: [] }).ok).toBe(false);
    expect(parseSettingsPatch({}).ok).toBe(false);
    expect(parseSettingsPatch(null).ok).toBe(false);
  });
});

describe('validateOAuthState', () => {
  const now = new Date('2026-10-23T00:00:00.000Z');
  const stored = { oauth_state: 'state-123', oauth_state_expires_at: '2026-10-23T00:10:00.000Z' };

  it('accepts the matching, unexpired state', () => {
    expect(validateOAuthState(stored, 'state-123', now)).toEqual({ ok: true });
  });

  it('rejects a different state', () => {
    expect(validateOAuthState(stored, 'state-124', now).ok).toBe(false);
    expect(validateOAuthState(stored, 'short', now).ok).toBe(false);
  });

  it('rejects an expired state', () => {
    expect(validateOAuthState(stored, 'state-123', new Date('2026-10-23T00:10:00.000Z')).ok).toBe(false);
  });

  it('rejects when no state was started (or it was already used)', () => {
    expect(validateOAuthState(null, 'state-123', now).ok).toBe(false);
    expect(validateOAuthState({ oauth_state: null, oauth_state_expires_at: null }, 'state-123', now).ok).toBe(false);
    expect(validateOAuthState(stored, '', now).ok).toBe(false);
  });
});

describe('buildAuthorizeUrl', () => {
  it('builds the consent URL from env', () => {
    const result = buildAuthorizeUrl(
      {
        CONVERRA_APP_URL: 'https://app.converra.app/',
        CONVERRA_CLIENT_ID: 'lunaa-crm',
        CONVERRA_REDIRECT_URI: 'https://crm.lunaawomencare.com/integrations/converra/callback',
      },
      's t',
    );
    expect(result).toEqual({
      ok: true,
      url: 'https://app.converra.app/connect?client_id=lunaa-crm&redirect_uri=https%3A%2F%2Fcrm.lunaawomencare.com%2Fintegrations%2Fconverra%2Fcallback&state=s+t',
    });
  });

  it('fails when env is missing', () => {
    expect(buildAuthorizeUrl({}, 'x').ok).toBe(false);
  });
});

describe('customerMatchesSegmentFilter', () => {
  it('null means all customers, including those without segments', () => {
    expect(customerMatchesSegmentFilter([], null)).toBe(true);
    expect(customerMatchesSegmentFilter(['a'], null)).toBe(true);
  });

  it('requires membership in at least one selected segment', () => {
    expect(customerMatchesSegmentFilter(['a', 'b'], ['b', 'c'])).toBe(true);
    expect(customerMatchesSegmentFilter(['a'], ['b'])).toBe(false);
    expect(customerMatchesSegmentFilter([], ['b'])).toBe(false);
  });
});
