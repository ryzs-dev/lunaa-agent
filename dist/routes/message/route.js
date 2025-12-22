"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageRouter = void 0;
const express_1 = __importDefault(require("express"));
const SendService_1 = require("../../modules/whatsapp/services/SendService");
const queue_1 = require("../../modules/queue/tracking_queue/queue");
const service_1 = require("../../modules/message_service/service");
exports.messageRouter = express_1.default.Router();
const whatsappSendService = new SendService_1.WhatsappSendService();
const messageService = new service_1.MessageService();
exports.messageRouter.post('/', async (req, res) => {
    const { to_number, body } = req.body;
    if (!to_number || !body) {
        return res.status(400).json({ error: 'User_number and body are required' });
    }
    try {
        const result = await whatsappSendService.sendTextMessage(to_number, body);
        res.status(200).json({ success: true, result });
    }
    catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message', details: error });
    }
});
exports.messageRouter.get('/templates', async (req, res) => {
    try {
        const templates = await whatsappSendService.getMessageTemplates();
        res.status(200).json({ success: true, templates });
    }
    catch (error) {
        console.error('Error fetching templates:', error);
        res
            .status(500)
            .json({ error: 'Failed to fetch templates', details: error });
    }
});
exports.messageRouter.post('/template', async (req, res) => {
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
    }
    catch (error) {
        console.error('Error sending template message:', error);
        res
            .status(500)
            .json({ error: 'Failed to send template message', details: error });
    }
});
exports.messageRouter.post('/track/manual', async (req, res) => {
    try {
        await (0, queue_1.enqueueTrackingJobs)();
        res.status(200).json({ success: true, message: 'Tracking jobs enqueued' });
    }
    catch (error) {
        console.error('Error tracking message:', error);
        res.status(500).json({ error: 'Failed to track message', details: error });
    }
});
exports.messageRouter.post('/track/admin', async (req, res) => {
    const body = req.body;
    try {
        await (0, queue_1.enqueueTrackingFromAdmin)(body);
        res.status(200).json({ success: true, message: 'Tracking jobs enqueued' });
    }
    catch (error) {
        console.error('Error tracking message from admin:', error);
        res.status(500).json({ error: 'Failed to track message', details: error });
    }
});
exports.messageRouter.get('/', async (req, res) => {
    try {
        const { data } = await messageService.getMessages();
        res.status(200).json({ success: true, data });
    }
    catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages', details: error });
    }
});
exports.messageRouter.get('/conversations/:id', async (req, res) => {
    const conversationId = Number(req.params.id);
    try {
        const { data } = await messageService.getMessagesByConversationId(conversationId);
        res.status(200).json({ success: true, data });
    }
    catch (error) {
        console.error('Error fetching messages by conversation ID:', error);
        res.status(500).json({ error: 'Failed to fetch messages', details: error });
    }
});
exports.messageRouter.get('/conversations', async (req, res) => {
    try {
        const { data } = await messageService.getConversations();
        res.status(200).json({ success: true, data });
    }
    catch (error) {
        console.error('Error fetching conversations:', error);
        res
            .status(500)
            .json({ error: 'Failed to fetch conversations', details: error });
    }
});
exports.messageRouter.get('/:wamid', async (req, res) => {
    const wamid = req.params.wamid;
    try {
        const { data } = await messageService.getMessageByWamid(wamid);
        res.status(200).json({ success: true, data });
    }
    catch (error) {
        console.error('Error fetching message by WAMID:', error);
        res.status(500).json({ error: 'Failed to fetch message', details: error });
    }
});
