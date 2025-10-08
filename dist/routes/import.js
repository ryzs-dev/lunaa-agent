"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const config_1 = __importDefault(require("../middleware/config"));
const service_1 = require("../modules/import/service");
const importRouter = express_1.default.Router();
const importService = new service_1.ImportService('http://localhost:4000');
/**
 * Endpoint to upload CSV and import via microservice
 */
importRouter.post('/', config_1.default.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const filePath = req.file.path;
        console.log('Received file:', filePath);
        // Call service to send CSV to import microservice and persist payload
        await importService.importCsv(filePath);
        // Clean up temp file
        fs_1.default.unlink(filePath, (err) => {
            if (err)
                console.error('Failed to remove temp file:', err);
        });
        // Return result
        res.json({ success: true, message: 'CSV sent to import service' });
    }
    catch (err) {
        console.error('CSV import failed:', err);
        res.status(500).json({ error: err.message });
    }
});
importRouter.post('/callback', async (req, res) => {
    try {
        const { orders } = req.body;
        if (!orders || !Array.isArray(orders)) {
            return res.status(400).json({ error: 'Invalid payload' });
        }
        const summary = {
            success: 0,
            failed: 0,
            errors: [],
        };
        // Loop and persist each order to CRM DB
        for (const order of orders) {
            // TODO: save to DB
            try {
                const result = await importService.savePayloadToDatabase(order);
                summary.success += result.success;
                summary.failed += result.failed;
                summary.errors.push(...result.errors);
            }
            catch (dbErr) {
                console.error('DB save error:', dbErr);
                summary.failed += 1;
                summary.errors.push({
                    customer: order.customer,
                    error: dbErr instanceof Error ? dbErr.message : String(dbErr),
                });
            }
            // console.log('Received order payload:', JSON.stringify(order, null, 2));
        }
        res.json({
            success: true,
            message: 'Payload processed',
            success_count: summary.success,
            failed_count: summary.failed,
            errors: summary.errors,
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});
exports.default = importRouter;
