import OrderTrackingService from '../order_tracking/service';
import { sub } from '../pubsub';
import { PubSubEvents } from './events';

const orderTrackingService = new OrderTrackingService();

export const initParcelDailySubscribers = () => {
  sub.subscribe(PubSubEvents.ORDER_UPDATED, (err, count) => {
    if (err) {
      console.error('❌ Failed to subscribe to ORDER_UPDATED:', err);
      return;
    }
    console.log(`📡 Subscribed to ${count} channel(s): ORDER_UPDATED`);
  });

  sub.subscribe(PubSubEvents.TRACKING_UPDATED, (err, count) => {
    if (err) {
      console.error('❌ Failed to subscribe to TRACKING_UPDATED:', err);
      return;
    }
    console.log(`📡 Subscribed to ${count} channel(s): TRACKING_UPDATED`);
  });

  sub.on('message', async (channel, message) => {
    const payload = JSON.parse(message);
    if (channel === PubSubEvents.ORDER_UPDATED) {
      const entryData = {
        tracking_number: payload.tracking_number,
        courier: payload.courier,
        status: payload.status || ('pending' as const),
      };

      // 🔄 Update CRM DB
      try {
        const result = await orderTrackingService.addTrackingEntry(
          entryData,
          payload.crm_order_id
        );
      } catch (error) {
        console.error('❌ Error updating CRM tracking entry:', error);
      }
    }

    if (channel === PubSubEvents.TRACKING_UPDATED) {
      try {
        const result = await orderTrackingService.getTrackingEntriesByOrderId(
          payload.crm_order_id
        );
        if (result.length === 0) {
          console.warn(
            '⚠️ No tracking entry found for order ID:',
            payload.crm_order_id
          );
          return;
        }
        await orderTrackingService.updateTrackingEntry(result[0].id, {
          status: payload.status,
        });
      } catch (error) {
        console.error(
          '❌ Error updating CRM tracking entry (TRACKING_UPDATED):',
          error
        );
      }
    }
  });
};
