"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastRouter = void 0;
const express_1 = require("express");
const broadcast_service_1 = require("./broadcast.service");
exports.broadcastRouter = (0, express_1.Router)();
const broadcastService = new broadcast_service_1.BroadcastService();
exports.broadcastRouter.post('/', async (req, res) => {
    try {
        const broadcastData = req.body;
        console.log('Received broadcast data:', broadcastData);
        if (!broadcastData) {
            return res
                .status(400)
                .json({ success: false, error: 'Broadcast data is required' });
        }
        const result = await broadcastService.createBroadcast(broadcastData);
        res.status(201).json({ success: true, result });
    }
    catch (error) {
        console.error('Error occurred while creating broadcast:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});
exports.broadcastRouter.get('/', async (req, res) => {
    try {
        const broadcasts = await broadcastService.getBroadcasts();
        res.json({ success: true, data: broadcasts });
    }
    catch (error) {
        console.error('Error occurred while fetching broadcasts:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});
exports.broadcastRouter.delete('/:broadcastId', async (req, res) => {
    try {
        const { broadcastId } = req.params;
        const broadcast = await broadcastService.deleteBroadcast(broadcastId);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error occurred while deleting broadcast:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});
exports.broadcastRouter.get('/:broadcastId', async (req, res) => {
    try {
        const { broadcastId } = req.params;
        const broadcast = await broadcastService.getBroadcastById(broadcastId);
        if (!broadcast) {
            return res
                .status(404)
                .json({ success: false, error: 'Broadcast not found' });
        }
        res.json({ success: true, data: broadcast });
    }
    catch (error) {
        console.error('Error occurred while fetching broadcast:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});
exports.broadcastRouter.post('/trigger/:broadcastId', async (req, res) => {
    try {
        const { broadcastId } = req.params;
        const broadcast = await broadcastService.triggerBroadcast(broadcastId);
        res.json({ success: true, data: broadcast });
    }
    catch (error) {
        console.error('Error occurred while sending broadcast:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});
