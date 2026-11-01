"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.shippingRouter = void 0;
const express_1 = __importDefault(require("express"));
const rules_1 = require("../modules/shipping/rules");
exports.shippingRouter = express_1.default.Router();
// GET /api/shipping/rules - fallback courier, COD courier, COD detection
exports.shippingRouter.get('/rules', async (_req, res) => {
    try {
        res.json({ success: true, rules: await (0, rules_1.getShippingRules)() });
    }
    catch (error) {
        console.error('Error fetching shipping rules:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PUT /api/shipping/rules { fallback_courier?, cod_courier?, detect_cod?, updated_by? }
exports.shippingRouter.put('/rules', async (req, res) => {
    var _a;
    try {
        res.json({ success: true, rules: await (0, rules_1.updateShippingRules)((_a = req.body) !== null && _a !== void 0 ? _a : {}) });
    }
    catch (error) {
        if (error instanceof rules_1.ShippingRulesError)
            return res.status(400).json({ error: error.message });
        console.error('Error saving shipping rules:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
