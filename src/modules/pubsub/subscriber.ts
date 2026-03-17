import { sub } from '../pubsub';
import { PubSubEvents } from './events';
import { Server as SocketIOServer } from 'socket.io';
import OrderTrackingService from '../order_tracking/service';

const orderTrackingService = new OrderTrackingService();

export const initParcelDailySubscribers = (io: SocketIOServer) => {
  const channels = [
    PubSubEvents.ORDER_CREATED,
    PubSubEvents.TRACKING_UPDATED,
    PubSubEvents.INCOMING_MESSAGE,
    PubSubEvents.OUTGOING_MESSAGE,
  ];

  // Subscribe individually
  for (const channel of channels) {
    sub.subscribe(channel, (err, count) => {
      if (err)
        return console.error(`❌ Failed to subscribe to ${channel}:`, err);
      console.log(`📡 Subscribed to ${channel} (${count} channel(s))`);
    });
  }

  // Handle all messages
  sub.on('message', async (channel, message) => {
    try {
      const payload = JSON.parse(message);
      console.log(`📨 Received ${channel}:`, payload);

      switch (channel) {
        case PubSubEvents.INCOMING_MESSAGE:
        case PubSubEvents.OUTGOING_MESSAGE:
          // Send only to relevant conversation room
          if (payload.conversation_id) {
            io.to(payload.conversation_id).emit('new_message', payload);

            const socketsInRoom = await io
              .in(payload.conversation_id)
              .fetchSockets();
            console.log(
              `Sockets in room ${payload.conversation_id}:`,
              socketsInRoom.length
            );
          }
          break;

        case PubSubEvents.ORDER_CREATED:
          await orderTrackingService.addTrackingEntry(
            {
              status: payload.status,
              courier: payload.courier,
              tracking_number: payload.tracking_number,
              message_status: 'pending',
              last_message_sent_at: null,
            },
            payload.crm_order_id
          );
          break;

        case PubSubEvents.TRACKING_UPDATED:
          const result = await orderTrackingService.getTrackingEntriesByOrderId(
            payload.crm_order_id
          );
          if (result.length) {
            await orderTrackingService.updateTrackingEntry(result[0].id, {
              status: payload.status,
            });
          }
          break;

        default:
          console.warn(`⚠️ Unknown channel: ${channel}`);
      }
    } catch (error) {
      console.error(`❌ Error processing message from ${channel}:`, error);
    }
  });
};
