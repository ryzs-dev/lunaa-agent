"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GRAPH = void 0;
exports.graphError = graphError;
exports.graphGet = graphGet;
exports.graphPost = graphPost;
exports.normaliseAccountId = normaliseAccountId;
const axios_1 = __importDefault(require("axios"));
exports.GRAPH = 'https://graph.facebook.com/v25.0';
// Meta's own error text ("Invalid OAuth access token", "Unsupported get request")
// is what staff need to fix the connection, so surface it as-is.
function graphError(error) {
    var _a, _b, _c;
    const meta = (_b = (_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error;
    if (meta === null || meta === void 0 ? void 0 : meta.message)
        return meta.error_user_msg || meta.message;
    return (_c = error === null || error === void 0 ? void 0 : error.message) !== null && _c !== void 0 ? _c : 'Meta request failed';
}
async function graphGet(path, token, params = {}) {
    const { data } = await axios_1.default.get(path.startsWith('http') ? path : `${exports.GRAPH}/${path}`, {
        params: path.startsWith('http') ? undefined : Object.assign(Object.assign({}, params), { access_token: token }),
        timeout: 30000,
    });
    return data;
}
async function graphPost(path, token, body) {
    const { data } = await axios_1.default.post(`${exports.GRAPH}/${path}`, body, {
        params: { access_token: token },
        timeout: 30000,
    });
    return data;
}
function normaliseAccountId(input) {
    const digits = input.trim().replace(/^act_/i, '').replace(/\D/g, '');
    return digits ? `act_${digits}` : '';
}
