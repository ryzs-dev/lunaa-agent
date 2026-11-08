"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.converraBody = converraBody;
exports.sendThroughConverra = sendThroughConverra;
const crypto_1 = __importDefault(require("crypto"));
const axios_1 = __importDefault(require("axios"));
const converra_connection_1 = require("./converra-connection");
function converraBody(payload, idempotencyKey) {
    var _a, _b, _c, _d, _e;
    const key = idempotencyKey !== null && idempotencyKey !== void 0 ? idempotencyKey : crypto_1.default.randomUUID();
    if (payload.template) {
        const components = Array.isArray(payload.template.components) ? payload.template.components : [];
        const body = components.find((component) => { var _a; return ((_a = component === null || component === void 0 ? void 0 : component.type) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === 'body'; });
        return {
            to: payload.to,
            idempotency_key: key,
            template: {
                name: payload.template.name,
                language: (_a = payload.template.language) === null || _a === void 0 ? void 0 : _a.code,
                variables: ((_b = body === null || body === void 0 ? void 0 : body.parameters) !== null && _b !== void 0 ? _b : []).map((parameter) => { var _a; return (_a = parameter.text) !== null && _a !== void 0 ? _a : ''; }),
            },
        };
    }
    return Object.assign({ to: payload.to, idempotency_key: key, text: (_d = (_c = payload.text) === null || _c === void 0 ? void 0 : _c.body) !== null && _d !== void 0 ? _d : '' }, (((_e = payload.buttons) === null || _e === void 0 ? void 0 : _e.length) ? { buttons: payload.buttons } : {}));
}
async function sendThroughConverra(payload, idempotencyKey) {
    const config = await (0, converra_connection_1.getConverraConfig)();
    if (!config)
        throw new Error('Converra is not connected');
    const { data } = await axios_1.default.post(`${config.baseUrl}/integrations/${config.businessId}/messages`, converraBody(payload, idempotencyKey), { headers: { 'X-Bridge-Key': config.apiKey }, timeout: 30000 });
    return { data: { messages: [{ id: data.provider_message_id, message_status: data.status }] } };
}
