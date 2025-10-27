"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.message_service = void 0;
const axios_1 = __importDefault(require("axios"));
const MESSAGE_SERVICE_URL = process.env.MESSAGE_SERVICE_URL || 'http://localhost:4001';
if (!MESSAGE_SERVICE_URL) {
    throw new Error('MESSAGE_SERVICE_URL is not defined');
}
exports.message_service = axios_1.default.create({
    baseURL: MESSAGE_SERVICE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});
