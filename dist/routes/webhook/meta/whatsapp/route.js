"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappWebhookRouter = void 0;
const express_1 = __importDefault(require("express"));
exports.whatsappWebhookRouter = express_1.default.Router();
exports.whatsappWebhookRouter.get('/whatsapp', (req, res) => {
    const VERIFY_TOKEN = 'supersecret'; // set in Meta dashboard
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('Webhook verified!');
        res.status(200).send(challenge);
    }
    else {
        res.sendStatus(403);
    }
});
exports.whatsappWebhookRouter.post('/whatsapp', async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    try {
        const body = req.body;
        const adminPhones = AUTHORIZED_AGENTS.map((agent) => agent.phoneNumber);
        if (body.object !== 'whatsapp_business_account') {
            return res.sendStatus(404);
        }
        for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
                const businessNumber = (_b = (_a = change.value) === null || _a === void 0 ? void 0 : _a.metadata) === null || _b === void 0 ? void 0 : _b.display_phone_number; // your WA business number
                const userNumber = (_e = (_d = (_c = change.value) === null || _c === void 0 ? void 0 : _c.contacts) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.wa_id; // the sender’s WhatsApp ID
                const profileName = ((_j = (_h = (_g = (_f = change.value) === null || _f === void 0 ? void 0 : _f.contacts) === null || _g === void 0 ? void 0 : _g[0]) === null || _h === void 0 ? void 0 : _h.profile) === null || _j === void 0 ? void 0 : _j.name) || '';
                for (const msg of ((_k = change.value) === null || _k === void 0 ? void 0 : _k.messages) || []) {
                    if (userNumber && adminPhones.includes(userNumber)) {
                        // 🔹 Admin flow
                        console.log('✅ Admin message from:', userNumber);
                        await waService.handleMessageExtraction(msg);
                        // await waService.handleInboundMessage(msg, businessNumber, profileName);
                    }
                    else {
                        // 🔹 Normal user flow
                        // console.log("📩 Normal user message from:", userNumber);
                        // await waService.handleInboundMessage(msg, businessNumber, profileName);
                    }
                }
            }
        }
        return res.sendStatus(200);
    }
    catch (err) {
        console.error('❌ Webhook error:', err);
        return res.status(500).json({ error: err.message });
    }
});
exports.whatsappWebhookRouter.get('/whatsapp/callback', (req, res) => { });
