"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.distributorRouter = void 0;
const express_1 = __importDefault(require("express"));
const service_1 = __importDefault(require("../modules/distributor/service"));
exports.distributorRouter = express_1.default.Router();
const distributorService = new service_1.default();
// GET /api/distributors - List distributors with their order counts
exports.distributorRouter.get('/', async (_req, res) => {
    try {
        const distributors = await distributorService.getAllDistributors();
        res.status(200).json({ success: true, distributors });
    }
    catch (error) {
        console.error('Error fetching distributors:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/distributors - Add a distributor by phone number
exports.distributorRouter.post('/', async (req, res) => {
    var _a;
    const { name, phone_number, notes } = (_a = req.body) !== null && _a !== void 0 ? _a : {};
    if (!phone_number || typeof phone_number !== 'string') {
        return res.status(400).json({ error: 'Phone number is required' });
    }
    try {
        const result = await distributorService.createDistributor({
            name,
            phone_number,
            notes,
        });
        res.status(201).json(Object.assign({ success: true }, result));
    }
    catch (error) {
        console.error('Error creating distributor:', error);
        if (error instanceof Error && error.message === 'Invalid phone number') {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/distributors/:id - Remove a distributor; their orders move back to customer orders
exports.distributorRouter.delete('/:id', async (req, res) => {
    try {
        const result = await distributorService.deleteDistributor(req.params.id);
        if (!result) {
            return res.status(404).json({ error: 'Distributor not found' });
        }
        res.status(200).json(Object.assign({ success: true }, result));
    }
    catch (error) {
        console.error('Error deleting distributor:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
