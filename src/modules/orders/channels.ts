// Where an order was sold. WhatsApp, Messenger and Instagram are our own chat
// sales: they have a customer record and ship through Parcel Daily. Shopee and
// Lazada orders ship through the marketplace.
export const CHAT_CHANNELS = ['whatsapp', 'messenger', 'instagram'] as const;
export const MARKETPLACE_CHANNELS = ['shopee', 'lazada'] as const;
export const ORDER_CHANNELS = [...CHAT_CHANNELS, ...MARKETPLACE_CHANNELS] as const;

export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export const CHANNEL_LABEL: Record<OrderChannel, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  shopee: 'Shopee',
  lazada: 'Lazada',
};

// Orders saved before channels existed, or with an unknown one, count as WhatsApp.
export function orderChannel(source: string | null | undefined): OrderChannel {
  return (ORDER_CHANNELS as readonly string[]).includes(source ?? '') ? (source as OrderChannel) : 'whatsapp';
}

export function isMarketplaceOrder(source: string | null | undefined) {
  return (MARKETPLACE_CHANNELS as readonly string[]).includes(source ?? '');
}

export function channelLabel(source: string | null | undefined) {
  return CHANNEL_LABEL[orderChannel(source)];
}
