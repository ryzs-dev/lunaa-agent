"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptSecret = encryptSecret;
exports.decryptSecret = decryptSecret;
const crypto_1 = __importDefault(require("crypto"));
// Encrypts the Anthropic key at rest. RECEIPTS_SECRET is 32 random bytes,
// base64, set only in the server's environment.
function secretKey() {
    const raw = process.env.RECEIPTS_SECRET;
    if (!raw)
        throw new Error('RECEIPTS_SECRET is not set on the server');
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32)
        throw new Error('RECEIPTS_SECRET must be 32 bytes, base64');
    return key;
}
function encryptSecret(plain) {
    const iv = crypto_1.default.randomBytes(12);
    const cipher = crypto_1.default.createCipheriv('aes-256-gcm', secretKey(), iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}
function decryptSecret(stored) {
    const [iv, tag, data] = stored.split('.').map((part) => Buffer.from(part, 'base64'));
    const decipher = crypto_1.default.createDecipheriv('aes-256-gcm', secretKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
