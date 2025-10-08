import express from 'express';
import { WhatsappSendService } from '../../modules/whatsapp/services/SendService';

export const messageRouter = express.Router();

const whatsappSendService = new WhatsappSendService();

messageRouter.post('/', async (req, res) => {
  const { to_number, body } = req.body;

  if (!to_number || !body) {
    return res.status(400).json({ error: 'User_number and body are required' });
  }

  try {
    const result = await whatsappSendService.sendTextMessage(to_number, body);
    res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message', details: error });
  }
});

messageRouter.get('/templates', async (req, res) => {
  try {
    const templates = await whatsappSendService.getMessageTemplates();
    res.status(200).json({ success: true, templates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res
      .status(500)
      .json({ error: 'Failed to fetch templates', details: error });
  }
});

messageRouter.post('/template', async (req, res) => {
  const { to_number, body } = req.body;
  if (!to_number) {
    return res
      .status(400)
      .json({ error: 'User number and template name are required' });
  }

  const payload = {
    to_number,
    template_name: 'delivery_update',
    parameters: body,
  };


  try {
    const result = await whatsappSendService.sendTemplateMessage(payload);
    res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('Error sending template message:', error);
    res
      .status(500)
      .json({ error: 'Failed to send template message', details: error });
  }
});
