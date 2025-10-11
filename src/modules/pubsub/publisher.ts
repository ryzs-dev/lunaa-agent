import { pub } from './index';
import { PubSubEvents } from './events';

export const publishOrderCreated = async (data: any) => {
  await pub.publish(PubSubEvents.ORDER_CREATED, JSON.stringify(data));
  console.log('📦 Published order.created event:', data);
};


