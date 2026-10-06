export const PLATFORMS = ['shopee', 'lazada'] as const;
export type Platform = (typeof PLATFORMS)[number];

export function isPlatform(value: unknown): value is Platform {
  return PLATFORMS.includes(value as Platform);
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date | null;
}

export interface Connection extends TokenSet {
  platform: Platform;
  shopId: string;
  shopName: string | null;
  region: string | null;
  lastSyncedAt: Date | null;
  lastSyncError: string | null;
  createdAt: Date;
}

export interface MarketplaceOrderItem {
  name: string;
  sku: string | null;
  variation: string | null;
  quantity: number;
  price: number;
}

export interface MarketplaceOrder {
  platform: Platform;
  shopId: string;
  externalId: string;
  orderNumber: string;
  status: string;
  buyerName: string | null;
  buyerPhone: string | null;
  shippingAddress: string | null;
  totalAmount: number;
  currency: string;
  items: MarketplaceOrderItem[];
  orderedAt: Date;
  updatedAt: Date | null;
  raw: unknown;
}

export interface PlatformClient {
  readonly configured: boolean;
  readonly environment: string;
  authorizeUrl(redirectUrl: string): string;
  exchangeCode(
    query: Record<string, string>,
    redirectUrl: string
  ): Promise<{ shopId: string; region: string | null; tokens: TokenSet }>;
  refresh(connection: Connection): Promise<TokenSet>;
  shopName(shopId: string, accessToken: string): Promise<string | null>;
  ordersUpdatedSince(shopId: string, accessToken: string, since: Date): Promise<MarketplaceOrder[]>;
}

export class MarketplaceError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}
