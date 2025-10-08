"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookRouter = void 0;
const express_1 = __importDefault(require("express"));
exports.webhookRouter = express_1.default.Router();
// When Parcel Daily sends updates to you
exports.webhookRouter.post('/parcel-daily', (req, res) => {
    const event = req.body;
    console.log('Incoming Parcel Daily webhook:', event);
    // TODO: save to DB or trigger business logic
    res.status(200).json({ success: true });
});
exports.webhookRouter.post('/parcel-daily/checkout', (req, res) => {
    const event = req.body;
    console.log('Incoming Parcel Daily Checkout webhook:', event);
    res.status(200).json({ success: true });
});
