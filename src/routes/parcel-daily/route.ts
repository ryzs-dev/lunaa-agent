import express from 'express';

export const parcelDailyRouter = express.Router();

// Parcel Daily API details
const BASE_URL = 'https://api.parceldaily.com/v1/partner';
const TOKEN_KEY = process.env.PARCEL_DAILY_TOKEN_KEY;
const MERCHANT_ID = process.env.PARCEL_DAILY_MERCHANT_ID;

const SERVICE_PROVIDERS = [
  'dhl',
  'flash',
  'jnt',
  'ninjavan',
  'citylink',
  'teleport',
  'poslaju',
  'sfstandard',
  'sfeconomy',
  'aramex',
  'best',
  'lineclear',
  'redly',
  'spx',
] as const;

// GET /account-info - Fetch account information from Parcel Daily
parcelDailyRouter.get('/account-info', async (req, res) => {
  if (!TOKEN_KEY || !MERCHANT_ID) {
    return res
      .status(500)
      .json({ error: 'Missing Parcel Daily API credentials' });
  }

  try {
    const response = await fetch(`${BASE_URL}/account-info`, {
      headers: {
        token: TOKEN_KEY,
        merchantid: MERCHANT_ID,
      },
    });

    if (!response.ok) {
      throw new Error(
        `ParcelDaily API error: ${response.status} ${response.statusText}`
      );
    }

    const { data } = await response.json();
    return res.status(200).json({ success: true, data: data });
  } catch (error: any) {
    console.error('Error fetching account info:', error);
    return res.status(500).json({ error: 'Failed to fetch account info' });
  }
});

// ORDER
// POST /create-order - Create a new order in Parcel Daily
parcelDailyRouter.post('/create', async (req, res) => {
  if (!TOKEN_KEY || !MERCHANT_ID) {
    return res
      .status(500)
      .json({ error: 'Missing Parcel Daily API credentials' });
  }

  const body = req.body ?? {};
  const errors: string[] = [];
  const sp = body.serviceProvider;

  // required fields check (simplified for this demo)
  if (!body.pickupAddress) errors.push('pickupAddress required');
  if (!body.clientAddress) errors.push('clientAddress required');

  if (errors.length) return res.status(400).json({ errors });

  // Build request payload
  const payload: any = {
    merchant_id: MERCHANT_ID,
    service_provider: sp,
    pickup_address: body.pickupAddress,
    client_address: body.clientAddress,
    is_dropoff: body.isDropoff,
    kg: body.kg,
    price: body.price,
    content: body.content,
    content_value: body.content_value,
    reference: body.reference,
  };

  Object.keys(payload).forEach(
    (k) => payload[k] === undefined && delete payload[k]
  );

  try {
    const resp = await fetch(`${BASE_URL}/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token: TOKEN_KEY,
        merchantid: MERCHANT_ID,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();
    return res.status(resp.status).json(data);
  } catch (err: any) {
    console.error('ParcelDaily create error:', err);
    return res
      .status(500)
      .json({ error: 'Failed to create order', details: err.message });
  }
});
