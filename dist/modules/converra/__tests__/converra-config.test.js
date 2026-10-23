"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const converra_config_1 = require("../converra-config");
const ENV = {
    CONVERRA_API_URL: 'https://api.converra.app/api/v1/',
    CONVERRA_BUSINESS_ID: 'env-business',
    CONVERRA_BRIDGE_API_KEY: 'env-key',
};
function row(overrides = {}) {
    return Object.assign({ business_id: null, workspace_name: null, access_key: null, api_base_url: null, connected_by: null, connected_at: null, auto_sync: null, sync_segments: null, sync_email: null, segment_ids: null, oauth_state: null, oauth_state_expires_at: null, disconnected_at: null }, overrides);
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
        expect((0, converra_config_1.resolveConverraConfig)(null, ENV)).toMatchObject({
            source: 'env',
            baseUrl: 'https://api.converra.app/api/v1',
            businessId: 'env-business',
            apiKey: 'env-key',
        });
    });
    it('returns null when neither a row nor complete env exists', () => {
        expect((0, converra_config_1.resolveConverraConfig)(null, {})).toBeNull();
        expect((0, converra_config_1.resolveConverraConfig)(null, Object.assign(Object.assign({}, ENV), { CONVERRA_BRIDGE_API_KEY: ' ' }))).toBeNull();
    });
    it('prefers a connected row over env', () => {
        expect((0, converra_config_1.resolveConverraConfig)(connected, ENV)).toEqual({
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
        var _a;
        expect((_a = (0, converra_config_1.resolveConverraConfig)(Object.assign(Object.assign({}, connected), { api_base_url: null }), ENV)) === null || _a === void 0 ? void 0 : _a.baseUrl).toBe('https://api.converra.app/api/v1');
    });
    it('a disconnected row disables the env connection', () => {
        const disconnected = Object.assign(Object.assign({}, connected), { access_key: null, disconnected_at: '2026-10-23T01:00:00.000Z' });
        expect((0, converra_config_1.resolveConverraConfig)(disconnected, ENV)).toBeNull();
    });
    it('a row with only an OAuth state or settings does not override env', () => {
        var _a;
        const pending = row({ oauth_state: 'abc', oauth_state_expires_at: '2026-10-23T01:00:00.000Z', auto_sync: false });
        expect((_a = (0, converra_config_1.resolveConverraConfig)(pending, ENV)) === null || _a === void 0 ? void 0 : _a.source).toBe('env');
    });
});
describe('syncSettingsFromRow / parseSettingsPatch', () => {
    it('defaults to sync everything', () => {
        expect((0, converra_config_1.syncSettingsFromRow)(null)).toEqual({ autoSync: true, syncSegments: true, syncEmail: true, segmentIds: null });
    });
    it('maps a valid patch to columns', () => {
        expect((0, converra_config_1.parseSettingsPatch)({ autoSync: false, segmentIds: ['a', 'a', 'b'] })).toEqual({
            ok: true,
            columns: { auto_sync: false, segment_ids: ['a', 'b'] },
        });
        expect((0, converra_config_1.parseSettingsPatch)({ segmentIds: null })).toEqual({ ok: true, columns: { segment_ids: null } });
    });
    it('rejects bad patches', () => {
        expect((0, converra_config_1.parseSettingsPatch)({ autoSync: 'yes' }).ok).toBe(false);
        expect((0, converra_config_1.parseSettingsPatch)({ segmentIds: [] }).ok).toBe(false);
        expect((0, converra_config_1.parseSettingsPatch)({}).ok).toBe(false);
        expect((0, converra_config_1.parseSettingsPatch)(null).ok).toBe(false);
    });
});
describe('validateOAuthState', () => {
    const now = new Date('2026-10-23T00:00:00.000Z');
    const stored = { oauth_state: 'state-123', oauth_state_expires_at: '2026-10-23T00:10:00.000Z' };
    it('accepts the matching, unexpired state', () => {
        expect((0, converra_config_1.validateOAuthState)(stored, 'state-123', now)).toEqual({ ok: true });
    });
    it('rejects a different state', () => {
        expect((0, converra_config_1.validateOAuthState)(stored, 'state-124', now).ok).toBe(false);
        expect((0, converra_config_1.validateOAuthState)(stored, 'short', now).ok).toBe(false);
    });
    it('rejects an expired state', () => {
        expect((0, converra_config_1.validateOAuthState)(stored, 'state-123', new Date('2026-10-23T00:10:00.000Z')).ok).toBe(false);
    });
    it('rejects when no state was started (or it was already used)', () => {
        expect((0, converra_config_1.validateOAuthState)(null, 'state-123', now).ok).toBe(false);
        expect((0, converra_config_1.validateOAuthState)({ oauth_state: null, oauth_state_expires_at: null }, 'state-123', now).ok).toBe(false);
        expect((0, converra_config_1.validateOAuthState)(stored, '', now).ok).toBe(false);
    });
});
describe('buildAuthorizeUrl', () => {
    it('builds the consent URL from env', () => {
        const result = (0, converra_config_1.buildAuthorizeUrl)({
            CONVERRA_APP_URL: 'https://app.converra.app/',
            CONVERRA_CLIENT_ID: 'lunaa-crm',
            CONVERRA_REDIRECT_URI: 'https://crm.lunaawomencare.com/integrations/converra/callback',
        }, 's t');
        expect(result).toEqual({
            ok: true,
            url: 'https://app.converra.app/connect?client_id=lunaa-crm&redirect_uri=https%3A%2F%2Fcrm.lunaawomencare.com%2Fintegrations%2Fconverra%2Fcallback&state=s+t',
        });
    });
    it('fails when env is missing', () => {
        expect((0, converra_config_1.buildAuthorizeUrl)({}, 'x').ok).toBe(false);
    });
});
describe('customerMatchesSegmentFilter', () => {
    it('null means all customers, including those without segments', () => {
        expect((0, converra_config_1.customerMatchesSegmentFilter)([], null)).toBe(true);
        expect((0, converra_config_1.customerMatchesSegmentFilter)(['a'], null)).toBe(true);
    });
    it('requires membership in at least one selected segment', () => {
        expect((0, converra_config_1.customerMatchesSegmentFilter)(['a', 'b'], ['b', 'c'])).toBe(true);
        expect((0, converra_config_1.customerMatchesSegmentFilter)(['a'], ['b'])).toBe(false);
        expect((0, converra_config_1.customerMatchesSegmentFilter)([], ['b'])).toBe(false);
    });
});
