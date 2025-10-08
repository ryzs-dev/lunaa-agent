import express from 'express';
import OrderTrackingService from '../modules/order_tracking/service';
import { UUID } from 'crypto';

export const orderTrackingRouter = express.Router();

const orderTrackingService = new OrderTrackingService()

orderTrackingRouter.patch('/:entryId', async (req, res) => {
    const { entryId } = req.params;
    const updates = req.body;

    try {
        const updatedEntry = await orderTrackingService.updateTrackingEntry(entryId, updates);
        res.status(200).json({ success: true, entry: updatedEntry });
    } catch (error) {
        console.error("Error updating tracking entry:", error);
        res.status(500).json({ error: "Internal server error" });
    }
})

orderTrackingRouter.delete('/:entryId', async (req, res) => {
    const { entryId } = req.params;
    const id = entryId as UUID;
    try {
         await orderTrackingService.deleteTrackingEntry(id);
        res.status(200).json({ success: true, message: "Tracking entry deleted successfully" });
    } catch (error) {
        console.error("Error deleting tracking entry:", error);
        res.status(500).json({ error: "Internal server error" });
    }
})