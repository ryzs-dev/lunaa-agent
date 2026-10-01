import express from 'express';
import dotenv from 'dotenv';
import {ParcelDailyService} from '../../modules/parcel-daily/service';
import path from 'path';
import {UUID} from 'crypto';

dotenv.config({path: path.resolve(__dirname, '../../../.env.local')});

export const parcelDailyRouter = express.Router();

const PARCEL_DAILY_API_URL =
    process.env.PARCEL_DAILY_API_URL || 'http://localhost:4002/api/parceldaily';

const parcelDailyService = new ParcelDailyService(PARCEL_DAILY_API_URL);

// GET /account-info - Fetch account information from Parcel Daily
parcelDailyRouter.get('/account-info', async (req, res) => {
    try {
        const {data} = await parcelDailyService.getAccountInfo();

        return res.status(200).json({success: true, data: data});
    } catch (error: any) {
        console.error('Error fetching account info:', error);
        return res.status(500).json({error: 'Failed to fetch account info'});
    }
});

// GET /settings - Pickup address, shipping defaults and connection details
parcelDailyRouter.get('/settings', async (req, res) => {
    try {
        const {data} = await parcelDailyService.getSettings();
        return res.status(200).json({success: true, data});
    } catch (error: any) {
        console.error('Error fetching Parcel Daily settings:', error?.message);
        return res.status(502).json({error: 'Couldn’t load Parcel Daily settings'});
    }
});

// PUT /settings
parcelDailyRouter.put('/settings', async (req, res) => {
    try {
        const {status, body} = await parcelDailyService.saveSettings(req.body);
        return res.status(status).json(body);
    } catch (error: any) {
        console.error('Error saving Parcel Daily settings:', error?.message);
        return res.status(502).json({error: 'Couldn’t save Parcel Daily settings'});
    }
});

// POST /quote - Live courier prices for a destination
parcelDailyRouter.post('/quote', async (req, res) => {
    const {postcode, country, weight, cod} = req.body ?? {};
    const digits = String(postcode ?? '').replace(/\D/g, '');

    if (country !== 'Malaysia' && country !== 'Singapore') {
        return res.status(400).json({error: 'Country must be Malaysia or Singapore'});
    }
    if (digits.length !== (country === 'Singapore' ? 6 : 5)) {
        return res.status(400).json({error: 'Invalid postcode'});
    }

    try {
        const data = await parcelDailyService.getQuotes({
            postcode: digits,
            country,
            weight: Number(weight) > 0 ? Number(weight) : 0.5,
            cod: Number(cod) > 0 ? Number(cod) : 0,
        });
        return res.status(200).json({success: true, data});
    } catch (error: any) {
        console.error('Error fetching courier quotes:', error?.response?.data || error?.message);
        return res.status(502).json({error: 'Couldn’t get courier prices from Parcel Daily'});
    }
});

// POST /order/create - Create a new shipment
parcelDailyRouter.post('/order/create', async (req, res) => {
    const {shipmentData, orderId} = req.body;

    const result = await parcelDailyService.createShipment(
        shipmentData,
        orderId
    );

    // 👇 IMPORTANT: do not wrap failures as success
    if (result?.success === false) {
        return res
            .status(result.status || 400)
            .json(result);
    }

    return res.status(200).json({
        success: true,
        data: result.data ?? result,
    });
});


// POST /order/create/bulk - Create multiple shipments in bulk
parcelDailyRouter.post('/order/create/bulk', async (req, res) => {
    const orders = req.body.shipments;

    if (!Array.isArray(orders) || orders.length === 0) {
        return res.status(400).json({error: 'Invalid orders array'});
    }

    try {
        const results = await parcelDailyService.createBulkShipments(orders);
        return res.status(200).json({success: true, data: results});
    } catch (error) {
        console.error('Error creating bulk shipments:', error);
        return res.status(500).json({error: 'Failed to create bulk shipments'});
    }
});

// GET /order/status
parcelDailyRouter.get('/order/:id', async (req, res) => {
    const {id} = req.params;
    const orderId = id as UUID;

    try {
        const result = await parcelDailyService.getOrderStatus(orderId);
        return res.status(200).json({success: true, data: result});
    } catch (error) {
        console.error('Error fetching order status:', error);
        return res.status(500).json({error: 'Failed to fetch order status'});
    }
});
