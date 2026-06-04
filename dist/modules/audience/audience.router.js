"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.audienceRouter = void 0;
const express_1 = require("express");
const audience_service_1 = require("./audience.service");
exports.audienceRouter = (0, express_1.Router)();
const audienceService = new audience_service_1.AudienceService();
exports.audienceRouter.post('/', async (req, res) => {
    try {
        const segment = await audienceService.createSegment(req.body);
        return res.json({
            success: true,
            data: segment,
        });
    }
    catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message,
        });
    }
});
exports.audienceRouter.post('/:segmentId/users', async (req, res) => {
    try {
        const { segmentId } = req.params;
        const { user_ids } = req.body;
        const result = await audienceService.addSegmentMembers(segmentId, user_ids);
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (err) {
        return res.status(400).json({
            success: false,
            message: err.message,
        });
    }
});
exports.audienceRouter.get('/', async (req, res) => {
    try {
        const segments = await audienceService.getSegments();
        return res.json({
            success: true,
            data: segments,
        });
    }
    catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
});
exports.audienceRouter.get('/:segmentId/users', async (req, res) => {
    try {
        const { segmentId } = req.params;
        const users = await audienceService.getSegmentUsers(segmentId);
        return res.json({
            success: true,
            data: users,
        });
    }
    catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
});
exports.audienceRouter.delete('/:segmentId', async (req, res) => {
    try {
        const { segmentId } = req.params;
        await audienceService.deleteSegment(segmentId);
        return res.json({
            success: true,
        });
    }
    catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
});
exports.audienceRouter.delete('/:segmentId/users/:userId', async (req, res) => {
    try {
        const { segmentId, userId } = req.params;
        await audienceService.removeCustomerFromSegment(segmentId, userId);
        return res.json({
            success: true,
        });
    }
    catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
});
