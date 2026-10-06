"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketplaceError = exports.PLATFORMS = void 0;
exports.isPlatform = isPlatform;
exports.PLATFORMS = ['shopee', 'lazada'];
function isPlatform(value) {
    return exports.PLATFORMS.includes(value);
}
class MarketplaceError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}
exports.MarketplaceError = MarketplaceError;
