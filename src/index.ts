import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import trackRouter from './routes/track';
import path from 'path';
import syncRouter from './routes/sync';
import twilioRouter from './routes/twilio';
import inboxRouter from './routes/inbox';
import whatsappRouter from './routes/whatsapp';
import supabaseRouter from './routes/supabase';

import { startDailyTrackingScheduler } from './scheduler/trackingScheduler';
import productsRouter from './routes/products';
import packagesRouter from './routes/packages';
import metaRouter from './routes/meta';
import customersRouter from './routes/customers';
import { orderRouter } from './routes/order';
import { addressRouter } from './routes/address';
import { orderTrackingRouter } from './routes/tracking';
import { parcelDailyRouter } from './routes/parcel-daily/route';
import { webhookRouter } from './routes/webhook/parcel-daily/route';
import importRouter from './routes/import';
import { messageRouter } from './routes/message/route';
import { statsRouter } from './routes/stats/route';
import { initParcelDailySubscribers } from './modules/pubsub/subscriber';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(cors());

initParcelDailySubscribers();

// Mount the routes
app.use('/api', trackRouter);
app.use('/api', twilioRouter);
app.use('/api/inbox', inboxRouter);
app.use('/sync', syncRouter);
app.use('/api', whatsappRouter);
app.use('/api/supabase', supabaseRouter);
app.use('/api/import', importRouter);
app.use('/api/products', productsRouter);
app.use('/api/packages', packagesRouter);
app.use('/api/meta', metaRouter);
app.use('/api/customers', customersRouter);
app.use('/api/orders', orderRouter);
app.use('/api/addresses', addressRouter);
app.use('/api/tracking', orderTrackingRouter);
app.use('/api/parcel-daily', parcelDailyRouter);
app.use('/webhook', webhookRouter);
app.use('/api/message', messageRouter);
app.use('/api/stats', statsRouter);
app.use('/api/whatsapp', messageRouter);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${port}`);
});

if (process.env.NODE_ENV === 'production') {
  console.log('\n📅 Starting daily tracking automation...');
  startDailyTrackingScheduler();
}
