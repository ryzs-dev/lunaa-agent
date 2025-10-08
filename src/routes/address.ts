import express from 'express';
import { UUID } from 'crypto';
import AddressService from '../modules/address/service';

export const addressRouter = express.Router();

const addressService = new AddressService()

// GET /api/addresses - Get all addresses with optional pagination, search, and sorting
addressRouter.get('/', async (req, res) => {
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
    } catch (error) {
        console.error("Error fetching addresses:", error);
        res.status(500).json({ error: "Internal server error" });
    }
})

// GET /api/addresses/:id - Get address by ID
addressRouter.get('/:id', async (req, res) => {
    const { id } = req.params;
    const addressId = id as UUID;

    try {
        const address = await addressService.getAddressById(addressId);
        res.status(200).json({ success: true, address });
    } catch (error) {
        console.error("Error fetching address:", error);
        res.status(500).json({ error: "Internal server error" });
    }
})

// GET /api/addresses/customer/:customerId - Get addresses by Customer ID
addressRouter.get('/customer/:customerId', async (req, res) => {
    const { customerId } = req.params;
    const custId = customerId as UUID;

    try {
        const addresses = await addressService.getAddressesByCustomerId(custId);
        res.status(200).json({ success: true, addresses }); 
    } catch (error){
        console.error("Error fetching orders by customer ID:", error);
        res.status(500).json({ error: "Internal server error" });
    }
})

// POST /api/orders - Create a new order
addressRouter.post('/', async (req, res) => {
    const orderData = req.body;

    try {
        const newAddress = await addressService.createAddress(orderData);
        res.status(201).json({ success: true, message: "Address created successfully", address: newAddress  });
    } catch (error) {
        console.error("Error creating address:", error);
        res.status(500).json({ error: "Internal server error" });
    }
})

// PATCH /api/addresses/:id - Update an existing address
addressRouter.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const addressId = id as UUID;
    const updates = req.body;

    try {
        const updatedAddress = await addressService.updateAddress(addressId, updates);
        res.status(200).json({ success: true, address: updatedAddress });
    } catch (error) {
        console.error("Error updating address:", error);
        res.status(500).json({ error: "Internal server error" });
    }
})

// DELETE /api/addresses/:id - Delete an address
addressRouter.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const addressId = id as UUID;
    try {
        await addressService.deleteAddress(addressId);
        res.status(200).json({ success: true, message: "Address deleted successfully" });
    } catch (error) {
        console.error("Error deleting address:", error);
        res.status(500).json({ error: "Internal server error" });
    }   
})
