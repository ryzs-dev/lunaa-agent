import express from 'express';
import { currentUserEmail, requireDashboardUser } from '../modules/converra/converra-auth.middleware';
import { supabase } from '../modules/supabase';

// Staff numbers the WhatsApp bot takes orders from. Anyone on this list can
// create orders, so every route needs a signed-in CRM user.
export const staffPhonesRouter = express.Router();
staffPhonesRouter.use(requireDashboardUser);

export function normalizeStaffPhone(input: unknown) {
  const digits = String(input ?? '').replace(/\D/g, '');
  const phone = digits.startsWith('0') ? `60${digits.slice(1)}` : digits;
  return /^60\d{9,10}$|^65\d{8}$/.test(phone) ? phone : null;
}

const list = async () => {
  const { data, error } = await supabase
    .from('staff_phones')
    .select('id, phone_number, name, added_by, created_at')
    .order('created_at');
  if (error) throw error;
  return data ?? [];
};

staffPhonesRouter.get('/', async (_req, res) => {
  try {
    res.json({ phones: await list() });
  } catch (error) {
    console.error('Error listing staff phones:', error);
    res.status(500).json({ error: 'Could not load the staff numbers' });
  }
});

staffPhonesRouter.post('/', async (req, res) => {
  const phone = normalizeStaffPhone(req.body?.phone_number);
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!phone) return res.status(400).json({ error: 'Enter a Malaysian or Singapore mobile number' });
  if (!name) return res.status(400).json({ error: 'Enter a name' });
  try {
    const { error } = await supabase
      .from('staff_phones')
      .insert({ phone_number: phone, name, added_by: currentUserEmail(res) });
    if (error?.code === '23505') return res.status(409).json({ error: 'That number is already on the list' });
    if (error) throw error;
    res.status(201).json({ phones: await list() });
  } catch (error) {
    console.error('Error adding staff phone:', error);
    res.status(500).json({ error: 'Could not add that number' });
  }
});

staffPhonesRouter.delete('/:id', async (req, res) => {
  try {
    const phones = await list();
    if (phones.length <= 1) return res.status(400).json({ error: 'Keep at least one number on the list' });
    const { error } = await supabase.from('staff_phones').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ phones: await list() });
  } catch (error) {
    console.error('Error removing staff phone:', error);
    res.status(500).json({ error: 'Could not remove that number' });
  }
});
