import express from 'express';
import cron from 'node-cron';
import * as service from './service';
import * as store from './store';
import { isPlatform, MarketplaceError, Platform } from './types';

export const marketplaceRouter = express.Router();

const RETURN_COOKIE = 'mp_return';
const ALLOWED_RETURN = [
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
  /^https:\/\/([a-z0-9-]+\.)*lunaawomencare\.com$/,
  /^http:\/\/localhost:\d+$/,
];

const callbackUrl = (platform: Platform) =>
  `${(process.env.PUBLIC_API_URL || 'https://agent.lunaawomencare.com').replace(/\/$/, '')}/api/marketplaces/${platform}/callback`;

function returnOrigin(req: express.Request) {
  const cookie = req.headers.cookie
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === RETURN_COOKIE)?.[1];
  const origin = cookie ? decodeURIComponent(cookie) : '';
  return ALLOWED_RETURN.some((pattern) => pattern.test(origin)) ? origin : null;
}

function sendError(res: express.Response, error: unknown) {
  if (error instanceof MarketplaceError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (store.isMissingTable(error as { code?: string })) {
    return res.status(503).json({ error: 'Marketplace tables haven’t been created yet.', setupRequired: true });
  }
  console.error('Marketplace error:', error);
  return res.status(500).json({ error: (error as Error).message || 'Something went wrong' });
}

function platformParam(req: express.Request) {
  const { platform } = req.params;
  if (!isPlatform(platform)) throw new MarketplaceError('Unknown marketplace', 404);
  return platform;
}

// GET / - Which marketplaces have app keys, and the shops connected to each.
marketplaceRouter.get('/', async (_req, res) => {
  try {
    const connections = await store.listConnections();
    return res.json({
      platforms: service.platformStatus(),
      setupRequired: false,
      connections: connections.map((c) => ({
        platform: c.platform,
        shopId: c.shopId,
        shopName: c.shopName,
        region: c.region,
        connectedAt: c.createdAt,
        lastSyncedAt: c.lastSyncedAt,
        lastSyncError: c.lastSyncError,
        expiresAt: c.refreshExpiresAt,
      })),
    });
  } catch (error) {
    if (store.isMissingTable(error as { code?: string })) {
      return res.json({ platforms: service.platformStatus(), setupRequired: true, connections: [] });
    }
    return sendError(res, error);
  }
});

// GET /:platform/connect?return=<dashboard origin> - Sends the merchant to the marketplace sign-in.
marketplaceRouter.get('/:platform/connect', (req, res) => {
  try {
    const platform = platformParam(req);
    const origin = String(req.query.return ?? '');
    if (!ALLOWED_RETURN.some((pattern) => pattern.test(origin))) {
      throw new MarketplaceError('Invalid return address');
    }
    const url = service.client(platform).authorizeUrl(callbackUrl(platform));
    res.setHeader(
      'Set-Cookie',
      `${RETURN_COOKIE}=${encodeURIComponent(origin)}; Path=/api/marketplaces; Max-Age=900; HttpOnly; Secure; SameSite=Lax`
    );
    return res.redirect(url);
  } catch (error) {
    return sendError(res, error);
  }
});

// GET /:platform/callback - The marketplace redirects here after the merchant approves.
marketplaceRouter.get('/:platform/callback', async (req, res) => {
  const origin = returnOrigin(req);
  const platform = req.params.platform;
  const back = (params: Record<string, string>) => {
    if (!origin) return res.status(200).send(params.error ?? 'Shop connected. You can close this tab.');
    return res.redirect(`${origin}/integrations/${platform}?${new URLSearchParams(params)}`);
  };
  try {
    if (!isPlatform(platform)) throw new MarketplaceError('Unknown marketplace', 404);
    const query = Object.fromEntries(
      Object.entries(req.query).map(([key, value]) => [key, String(value)])
    );
    const { shopId } = await service.connect(platform, query, callbackUrl(platform));
    service.syncShop(platform, shopId).catch((error) =>
      console.error(`First ${platform} sync failed:`, error.message)
    );
    return back({ connected: shopId });
  } catch (error) {
    console.error(`${platform} sign-in failed:`, error);
    const message = store.isMissingTable(error as { code?: string })
      ? 'Marketplace tables haven’t been created yet.'
      : (error as Error).message || 'Sign-in failed';
    return back({ error: message });
  }
});

// POST /:platform/:shopId/sync - Pull orders updated since the last sync.
marketplaceRouter.post('/:platform/:shopId/sync', async (req, res) => {
  try {
    const result = await service.syncShop(platformParam(req), req.params.shopId);
    return res.json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

// DELETE /:platform/:shopId - Forget the shop's tokens. Pulled orders are kept.
marketplaceRouter.delete('/:platform/:shopId', async (req, res) => {
  try {
    await store.deleteConnection(platformParam(req), req.params.shopId);
    return res.status(204).end();
  } catch (error) {
    return sendError(res, error);
  }
});

// GET /:platform/orders?shopId=&limit=&offset=
marketplaceRouter.get('/:platform/orders', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const result = await store.listOrders({
      platform: platformParam(req),
      shopId: req.query.shopId ? String(req.query.shopId) : undefined,
      limit,
      offset,
    });
    return res.json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

export function startMarketplaceSync() {
  cron.schedule('*/30 * * * *', () => {
    service.syncAll().catch((error) => console.error('Marketplace sync failed:', error));
  });
}
