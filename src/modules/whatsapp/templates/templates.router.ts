import { Router } from 'express';
import { WhatsappTemplatesService } from './templates.service';

export const whatsappTemplatesRouter = Router();

const whatsappTemplatesService = new WhatsappTemplatesService();

whatsappTemplatesRouter.get('/templates/:template_id', async (req, res) => {
  try {
    const templateId = req.params.template_id;
    const template = await whatsappTemplatesService.getTemplateById(templateId);
    res.json({ success: true, data: template });
  } catch (error) {
    console.error('Error fetching WhatsApp template by ID:', error);
    res
      .status(500)
      .json({ success: false, message: 'Failed to fetch template by ID' });
  }
});

whatsappTemplatesRouter.get('/templates', async (req, res) => {
  try {
    const templates = await whatsappTemplatesService.getAllTemplates();
    res.json({ success: true, data: templates });
  } catch (error) {
    console.error('Error fetching WhatsApp templates:', error);
    res
      .status(500)
      .json({ success: false, message: 'Failed to fetch templates' });
  }
});

whatsappTemplatesRouter.post('/templates', async (req, res) => {
  try {
    const templateData = req.body;

    const createdTemplate =
      await whatsappTemplatesService.createTemplate(templateData);
    res.json({ success: true, data: createdTemplate });
  } catch (error) {
    console.error('Error creating WhatsApp template:', error);
    res
      .status(500)
      .json({ success: false, message: 'Failed to create template' });
  }
});

whatsappTemplatesRouter.delete('/templates', async (req, res) => {
  try {
    const name = req.query.name as string | undefined;
    const hsm_id = req.query.hsm_id as string | undefined;

    const result = await whatsappTemplatesService.deleteTemplate({
      name,
      hsm_id,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('DELETE /templates error:', error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

whatsappTemplatesRouter.post('/templates/send', async (req, res) => {
  try {
    const params = req.body;
    const result = await whatsappTemplatesService.sendTemplate(params);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error sending WhatsApp template:', error);
    res
      .status(500)
      .json({ success: false, message: 'Failed to send template' });
  }
});
