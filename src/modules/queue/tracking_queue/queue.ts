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

    console.log(
      `Row ${i}: name=${name}, phone=${phone}, tracking=${tracking}, courier=${courier}`
    );

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
