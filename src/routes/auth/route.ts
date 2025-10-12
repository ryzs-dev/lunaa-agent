import { Router } from 'express';
import { supabase } from '../../modules/supabase';

const authRouter = Router();

// Admin creates user
authRouter.post('/create-user', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Missing email or password' });

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) return res.status(400).json({ error: error.message });
  res.json({ user: data.user });
});

export default authRouter;
