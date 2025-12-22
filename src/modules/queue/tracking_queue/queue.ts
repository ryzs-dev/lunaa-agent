import { Queue } from 'bullmq';
import connection from '..';
import { GoogleSheetService } from '../../google/service';

const googleSheetService = new GoogleSheetService();

const trackingQueue = new Queue('tracking_queue', {
  connection: connection,
});

export async function enqueueTrackingJobs() {
  const rows = await googleSheetService.getSheetData('Test');
  const header = rows[0];

  const nameCol = header.findIndex((c: string) =>
    c.toLowerCase().includes('name')
  );
  const phoneCol = header.findIndex((c: string) =>
    c.toLowerCase().includes('phone')
  );
  const trackingCol = header.findIndex((c: string) =>
    c.toLowerCase().includes('tracking')
  );
  const courierCol = header.findIndex(
    (c: string) =>
      c.toLowerCase().includes('couriers company') ||
      c.toLowerCase().includes('courier company') ||
      c.toLowerCase().includes('courier')
  );

  const jobs = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = row[nameCol]?.trim();
    const phone = row[phoneCol]?.trim();
    const tracking = row[trackingCol]?.trim();
    const courier = row[courierCol]?.trim();

    if (!phone || !tracking) continue;

    jobs.push({
      name,
      phone,
      tracking,
      courier,
      createdAt: new Date().toISOString(),
    });
  }

  await trackingQueue.addBulk(
    jobs.map((data) => ({ name: 'sendTracking', data }))
  );

  console.log(`📦 Enqueued ${jobs.length} tracking jobs`);
}

type TrackingInput = {
  name?: string;
  phone: string;
  tracking: string;
  courier?: string;
  orderTrackingId: string;
};

export async function enqueueTrackingFromAdmin(
  body: TrackingInput | TrackingInput[]
) {
  // Normalize to array
  const items = Array.isArray(body) ? body : [body];

  // Build jobs
  const jobs = items
    .filter((item) => item.phone && item.tracking)
    .map((item) => ({
      name: 'sendTracking',
      data: {
        orderTrackingId: item.orderTrackingId,
        name: item.name,
        phone: item.phone,
        tracking: item.tracking,
        courier: item.courier,
        createdAt: new Date().toISOString(),
      },
    }));

  if (jobs.length === 0) {
    throw new Error('No valid tracking jobs to enqueue');
  }

  // Enqueue
  if (jobs.length === 1) {
    await trackingQueue.add(jobs[0].name, jobs[0].data);
  } else {
    await trackingQueue.addBulk(jobs);
  }

  console.log(`📦 Enqueued ${jobs.length} tracking job(s)`);
}
