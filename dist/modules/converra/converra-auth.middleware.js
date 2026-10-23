"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireDashboardUser = requireDashboardUser;
exports.currentUserEmail = currentUserEmail;
const crypto_1 = require("crypto");
const supabase_1 = require("../supabase");
const CACHE_TTL_MS = 60000;
const CACHE_MAX = 200;
const verified = new Map();
function tokenFrom(req) {
    var _a;
    const header = req.headers.authorization;
    const match = typeof header === 'string' ? /^Bearer\s+(.+)$/i.exec(header.trim()) : null;
    return ((_a = match === null || match === void 0 ? void 0 : match[1]) === null || _a === void 0 ? void 0 : _a.trim()) || null;
}
async function requireDashboardUser(req, res, next) {
    var _a;
    if (req.method === 'OPTIONS')
        return next();
    const token = tokenFrom(req);
    if (!token)
        return res.status(401).json({ success: false, error: 'Sign in to continue' });
    // Status is polled every few seconds while a sync runs — don't hit Supabase Auth each time.
    const key = (0, crypto_1.createHash)('sha256').update(token).digest('hex');
    const cached = verified.get(key);
    if (cached && cached.until > Date.now()) {
        res.locals.user = cached.user;
        return next();
    }
    try {
        const { data, error } = await supabase_1.supabase.auth.getUser(token);
        if (error || !data.user) {
            verified.delete(key);
            return res.status(401).json({ success: false, error: 'Your session has expired — sign in again' });
        }
        const user = { id: data.user.id, email: (_a = data.user.email) !== null && _a !== void 0 ? _a : null };
        if (verified.size >= CACHE_MAX)
            verified.clear();
        verified.set(key, { user, until: Date.now() + CACHE_TTL_MS });
        res.locals.user = user;
        return next();
    }
    catch (err) {
        console.error('[ConverraAuth] Failed to verify the session:', err);
        return res.status(503).json({ success: false, error: 'Couldn’t verify your session — try again' });
    }
}
function currentUserEmail(res) {
    var _a, _b;
    return (_b = (_a = res.locals.user) === null || _a === void 0 ? void 0 : _a.email) !== null && _b !== void 0 ? _b : null;
}
