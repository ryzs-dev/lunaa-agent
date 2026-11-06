"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.staffPhonesRouter = void 0;
exports.normalizeStaffPhone = normalizeStaffPhone;
const express_1 = __importDefault(require("express"));
const converra_auth_middleware_1 = require("../modules/converra/converra-auth.middleware");
const supabase_1 = require("../modules/supabase");
// Staff numbers the WhatsApp bot takes orders from. Anyone on this list can
// create orders, so every route needs a signed-in CRM user.
exports.staffPhonesRouter = express_1.default.Router();
exports.staffPhonesRouter.use(converra_auth_middleware_1.requireDashboardUser);
function normalizeStaffPhone(input) {
    const digits = String(input !== null && input !== void 0 ? input : '').replace(/\D/g, '');
    const phone = digits.startsWith('0') ? `60${digits.slice(1)}` : digits;
    return /^60\d{9,10}$|^65\d{8}$/.test(phone) ? phone : null;
}
const list = async () => {
    const { data, error } = await supabase_1.supabase
        .from('staff_phones')
        .select('id, phone_number, name, added_by, created_at')
        .order('created_at');
    if (error)
        throw error;
    return data !== null && data !== void 0 ? data : [];
};
exports.staffPhonesRouter.get('/', async (_req, res) => {
    try {
        res.json({ phones: await list() });
    }
    catch (error) {
        console.error('Error listing staff phones:', error);
        res.status(500).json({ error: 'Could not load the staff numbers' });
    }
});
exports.staffPhonesRouter.post('/', async (req, res) => {
    var _a, _b;
    const phone = normalizeStaffPhone((_a = req.body) === null || _a === void 0 ? void 0 : _a.phone_number);
    const name = typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.name) === 'string' ? req.body.name.trim() : '';
    if (!phone)
        return res.status(400).json({ error: 'Enter a Malaysian or Singapore mobile number' });
    if (!name)
        return res.status(400).json({ error: 'Enter a name' });
    try {
        const { error } = await supabase_1.supabase
            .from('staff_phones')
            .insert({ phone_number: phone, name, added_by: (0, converra_auth_middleware_1.currentUserEmail)(res) });
        if ((error === null || error === void 0 ? void 0 : error.code) === '23505')
            return res.status(409).json({ error: 'That number is already on the list' });
        if (error)
            throw error;
        res.status(201).json({ phones: await list() });
    }
    catch (error) {
        console.error('Error adding staff phone:', error);
        res.status(500).json({ error: 'Could not add that number' });
    }
});
exports.staffPhonesRouter.delete('/:id', async (req, res) => {
    try {
        const phones = await list();
        if (phones.length <= 1)
            return res.status(400).json({ error: 'Keep at least one number on the list' });
        const { error } = await supabase_1.supabase.from('staff_phones').delete().eq('id', req.params.id);
        if (error)
            throw error;
        res.json({ phones: await list() });
    }
    catch (error) {
        console.error('Error removing staff phone:', error);
        res.status(500).json({ error: 'Could not remove that number' });
    }
});
