"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderTrackingRouter = void 0;
const express_1 = __importDefault(require("express"));
const service_1 = __importDefault(require("../modules/order_tracking/service"));
exports.orderTrackingRouter = express_1.default.Router();
const orderTrackingService = new service_1.default();
exports.orderTrackingRouter.patch('/:entryId', async (req, res) => {
    const { entryId } = req.params;
    const updates = req.body;
    try {
        const updatedEntry = await orderTrackingService.updateTrackingEntry(entryId, updates);
        res.status(200).json({ success: true, entry: updatedEntry });
    }
    catch (error) {
        console.error('Error updating tracking entry:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.orderTrackingRouter.delete('/:entryId', async (req, res) => {
    const { entryId } = req.params;
    const id = entryId;
    try {
        await orderTrackingService.deleteTrackingEntry(id);
        res
            .status(200)
            .json({ success: true, message: 'Tracking entry deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting tracking entry:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
