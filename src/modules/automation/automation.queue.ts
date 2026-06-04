import { Queue } from 'bullmq';
import connection from '../queue';

export const automationQueue = new Queue('automation', {
  connection,
});
