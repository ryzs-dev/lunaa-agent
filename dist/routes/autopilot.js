"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.autopilotRouter = void 0;
const express_1 = __importDefault(require("express"));
const service_1 = __importStar(require("../modules/autopilot/service"));
exports.autopilotRouter = express_1.default.Router();
const autopilot = new service_1.default();
const isStep = (value) => value === 'ship' || value === 'tracking';
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
function validateSettings(body) {
    for (const field of ['enabled', 'ship_enabled', 'tracking_enabled', 'include_distributors']) {
        if (body[field] !== undefined && typeof body[field] !== 'boolean')
            return `${field} must be true or false`;
    }
    for (const field of ['ship_time', 'tracking_time']) {
        if (body[field] !== undefined && (typeof body[field] !== 'string' || !TIME.test(body[field]))) {
            return `${field} must be a time like 14:00`;
        }
    }
    for (const field of ['ship_mode', 'tracking_mode']) {
        if (body[field] !== undefined && body[field] !== 'review' && body[field] !== 'auto') {
            return `${field} must be review or auto`;
        }
    }
    const ranges = [
        ['lookback_days', 1, 30],
        ['max_orders_per_run', 1, 500],
        ['min_credit', 0, 100000],
    ];
    for (const [field, min, max] of ranges) {
        const value = body[field];
        if (value === undefined)
            continue;
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
            return `${field} must be a number from ${min} to ${max}`;
        }
        if (field !== 'min_credit' && !Number.isInteger(value))
            return `${field} must be a whole number`;
    }
    return null;
}
// GET /api/autopilot/settings
exports.autopilotRouter.get('/settings', async (_req, res) => {
    try {
        res.json({ success: true, settings: await autopilot.getSettings() });
    }
    catch (error) {
        console.error('Error fetching autopilot settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PUT /api/autopilot/settings - partial update
exports.autopilotRouter.put('/settings', async (req, res) => {
    var _a;
    const body = ((_a = req.body) !== null && _a !== void 0 ? _a : {});
    const invalid = validateSettings(body);
    if (invalid)
        return res.status(400).json({ error: invalid });
    try {
        const settings = await autopilot.updateSettings(body);
        res.json({ success: true, settings });
    }
    catch (error) {
        console.error('Error saving autopilot settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/autopilot/preview?step=ship - what a step would act on now
exports.autopilotRouter.get('/preview', async (req, res) => {
    const { step } = req.query;
    if (!isStep(step))
        return res.status(400).json({ error: 'step must be ship or tracking' });
    try {
        res.json({ success: true, items: await autopilot.preview(step) });
    }
    catch (error) {
        console.error('Error building autopilot preview:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/autopilot/runs
exports.autopilotRouter.get('/runs', async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    try {
        res.json({ success: true, runs: await autopilot.listRuns(limit) });
    }
    catch (error) {
        console.error('Error fetching autopilot runs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/autopilot/runs { step } - run a step now (respects its mode)
exports.autopilotRouter.post('/runs', async (req, res) => {
    var _a;
    const { step } = (_a = req.body) !== null && _a !== void 0 ? _a : {};
    if (!isStep(step))
        return res.status(400).json({ error: 'step must be ship or tracking' });
    try {
        const run = await autopilot.prepare(step, 'manual');
        res.status(201).json({ success: true, run });
    }
    catch (error) {
        if (error instanceof service_1.AutopilotBusyError)
            return res.status(409).json({ error: error.message });
        console.error('Error starting autopilot run:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/autopilot/runs/:id/approve { approved_by }
exports.autopilotRouter.post('/runs/:id/approve', async (req, res) => {
    var _a;
    try {
        const run = await autopilot.approve(req.params.id, (_a = req.body) === null || _a === void 0 ? void 0 : _a.approved_by);
        if (!run)
            return res.status(409).json({ error: 'This batch is no longer waiting for approval' });
        res.json({ success: true, run });
    }
    catch (error) {
        console.error('Error approving autopilot run:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/autopilot/runs/:id/dismiss
exports.autopilotRouter.post('/runs/:id/dismiss', async (req, res) => {
    try {
        const run = await autopilot.dismiss(req.params.id);
        if (!run)
            return res.status(409).json({ error: 'This batch is no longer waiting for approval' });
        res.json({ success: true, run });
    }
    catch (error) {
        console.error('Error dismissing autopilot run:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/autopilot/hold { order_id, hold, run_id? }
exports.autopilotRouter.post('/hold', async (req, res) => {
    var _a;
    const { order_id: orderId, hold, run_id: runId } = (_a = req.body) !== null && _a !== void 0 ? _a : {};
    if (typeof orderId !== 'string' || typeof hold !== 'boolean') {
        return res.status(400).json({ error: 'order_id and hold are required' });
    }
    try {
        if (typeof runId === 'string') {
            const run = await autopilot.holdInRun(runId, orderId, hold);
            return res.json({ success: true, run });
        }
        const order = await autopilot.setHold(orderId, hold);
        res.json({ success: true, order });
    }
    catch (error) {
        console.error('Error changing autopilot hold:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
