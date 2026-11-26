"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHANNEL_LABEL = exports.ORDER_CHANNELS = exports.MARKETPLACE_CHANNELS = exports.CHAT_CHANNELS = void 0;
exports.orderChannel = orderChannel;
exports.isMarketplaceOrder = isMarketplaceOrder;
exports.channelLabel = channelLabel;
// Where an order was sold. WhatsApp, Messenger and Instagram are our own chat
// sales: they have a customer record and ship through Parcel Daily. Shopee and
// Lazada orders ship through the marketplace.
exports.CHAT_CHANNELS = ['whatsapp', 'messenger', 'instagram'];
exports.MARKETPLACE_CHANNELS = ['shopee', 'lazada'];
exports.ORDER_CHANNELS = [...exports.CHAT_CHANNELS, ...exports.MARKETPLACE_CHANNELS];
exports.CHANNEL_LABEL = {
    whatsapp: 'WhatsApp',
    messenger: 'Messenger',
    instagram: 'Instagram',
    shopee: 'Shopee',
    lazada: 'Lazada',
};
// Orders saved before channels existed, or with an unknown one, count as WhatsApp.
function orderChannel(source) {
    return exports.ORDER_CHANNELS.includes(source !== null && source !== void 0 ? source : '') ? source : 'whatsapp';
}
function isMarketplaceOrder(source) {
    return exports.MARKETPLACE_CHANNELS.includes(source !== null && source !== void 0 ? source : '');
}
function channelLabel(source) {
    return exports.CHANNEL_LABEL[orderChannel(source)];
}
