"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../../modules/supabase");
const authRouter = (0, express_1.Router)();
// Admin creates user
authRouter.post('/create-user', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({ error: 'Missing email or password' });
    const { data, error } = await supabase_1.supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
    });
    if (error)
        return res.status(400).json({ error: error.message });
    res.json({ user: data.user });
});
exports.default = authRouter;
