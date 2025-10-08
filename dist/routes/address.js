"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addressRouter = void 0;
const express_1 = __importDefault(require("express"));
const service_1 = __importDefault(require("../modules/address/service"));
exports.addressRouter = express_1.default.Router();
const addressService = new service_1.default();
// GET /api/addresses - Get all addresses with optional pagination, search, and sorting
exports.addressRouter.get('/', async (req, res) => {
    const { limit, offset, search, sortBy, sortOrder } = req.query;
    try {
        const addresses = await addressService.getAllAddress();
        res.status(200).json({
            success: true,
            addresses: addresses,
            pagination: {
                limit: Number(limit) || 20,
                offset: Number(offset) || 0,
                total: addresses.length
            }
        });
    }
    catch (error) {
        console.error("Error fetching addresses:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/addresses/:id - Get address by ID
exports.addressRouter.get('/:id', async (req, res) => {
    const { id } = req.params;
    const addressId = id;
    try {
        const address = await addressService.getAddressById(addressId);
        res.status(200).json({ success: true, address });
    }
    catch (error) {
        console.error("Error fetching address:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/addresses/customer/:customerId - Get addresses by Customer ID
exports.addressRouter.get('/customer/:customerId', async (req, res) => {
    const { customerId } = req.params;
    const custId = customerId;
    try {
        const addresses = await addressService.getAddressesByCustomerId(custId);
        res.status(200).json({ success: true, addresses });
    }
    catch (error) {
        console.error("Error fetching orders by customer ID:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// POST /api/orders - Create a new order
exports.addressRouter.post('/', async (req, res) => {
    const orderData = req.body;
    try {
        const newAddress = await addressService.createAddress(orderData);
        res.status(201).json({ success: true, message: "Address created successfully", address: newAddress });
    }
    catch (error) {
        console.error("Error creating address:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PATCH /api/addresses/:id - Update an existing address
exports.addressRouter.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const addressId = id;
    const updates = req.body;
    try {
        const updatedAddress = await addressService.updateAddress(addressId, updates);
        res.status(200).json({ success: true, address: updatedAddress });
    }
    catch (error) {
        console.error("Error updating address:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /api/addresses/:id - Delete an address
exports.addressRouter.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const addressId = id;
    try {
        await addressService.deleteAddress(addressId);
        res.status(200).json({ success: true, message: "Address deleted successfully" });
    }
    catch (error) {
        console.error("Error deleting address:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
