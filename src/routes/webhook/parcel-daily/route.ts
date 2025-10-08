import express from 'express';

export const webhookRouter = express.Router();

// When Parcel Daily sends updates to you
webhookRouter.post('/parcel-daily', (req, res) => {
  const event = req.body;

  console.log('Incoming Parcel Daily webhook:', event);

  // TODO: save to DB or trigger business logic
  res.status(200).json({ success: true });
});

webhookRouter.post('/parcel-daily/checkout', (req, res) => {
  const event = req.body;

  console.log('Incoming Parcel Daily Checkout webhook:', event);

  res.status(200).json({ success: true });
});
