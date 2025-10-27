import axios from 'axios';

const MESSAGE_SERVICE_URL =
  process.env.MESSAGE_SERVICE_URL || 'http://localhost:4001';

if (!MESSAGE_SERVICE_URL) {
  throw new Error('MESSAGE_SERVICE_URL is not defined');
}

export const message_service = axios.create({
  baseURL: MESSAGE_SERVICE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});
