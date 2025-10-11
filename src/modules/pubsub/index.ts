import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

const baseConfig = {
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : undefined,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
};

export const pub = new Redis(baseConfig); // Publisher
export const sub = new Redis(baseConfig); // Subscriber

console.log('Redis pub/sub connections established', {
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD ? '****' : 'not set',
});
