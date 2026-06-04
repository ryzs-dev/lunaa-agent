"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappTemplatesRouter = void 0;
const express_1 = require("express");
const templates_service_1 = require("./templates.service");
exports.whatsappTemplatesRouter = (0, express_1.Router)();
const whatsappTemplatesService = new templates_service_1.WhatsappTemplatesService();
exports.whatsappTemplatesRouter.get('/templates/:template_id', async (req, res) => {
    try {
        const templateId = req.params.template_id;
        const template = await whatsappTemplatesService.getTemplateById(templateId);
        res.json({ success: true, data: template });
    }
    catch (error) {
        console.error('Error fetching WhatsApp template by ID:', error);
        res
            .status(500)
            .json({ success: false, message: 'Failed to fetch template by ID' });
    }
});
exports.whatsappTemplatesRouter.get('/templates', async (req, res) => {
    try {
        const templates = await whatsappTemplatesService.getAllTemplates();
        res.json({ success: true, data: templates });
    }
    catch (error) {
        console.error('Error fetching WhatsApp templates:', error);
        res
            .status(500)
            .json({ success: false, message: 'Failed to fetch templates' });
    }
});
exports.whatsappTemplatesRouter.post('/templates', async (req, res) => {
    try {
        const templateData = req.body;
        const createdTemplate = await whatsappTemplatesService.createTemplate(templateData);
        res.json({ success: true, data: createdTemplate });
    }
    catch (error) {
        console.error('Error creating WhatsApp template:', error);
        res
            .status(500)
            .json({ success: false, message: 'Failed to create template' });
    }
});
exports.whatsappTemplatesRouter.delete('/templates', async (req, res) => {
    try {
        const name = req.query.name;
        const hsm_id = req.query.hsm_id;
        const result = await whatsappTemplatesService.deleteTemplate({
            name,
            hsm_id,
        });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('DELETE /templates error:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
exports.whatsappTemplatesRouter.post('/templates/send', async (req, res) => {
    try {
        const params = req.body;
        const result = await whatsappTemplatesService.sendTemplate(params);
        res.json({ success: true, data: result });
    }
    catch (error) {
        console.error('Error sending WhatsApp template:', error);
        res
            .status(500)
            .json({ success: false, message: 'Failed to send template' });
    }
});
