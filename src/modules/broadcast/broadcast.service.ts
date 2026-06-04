import { MessageService } from '../message_service/service';
import { BroadcastDB } from './broadcast.db';
import { BroadcastDataInput } from './broadcast.type';

export class BroadcastService {
  private broadcastDB: BroadcastDB;
  messageService: MessageService;

  constructor() {
    this.broadcastDB = new BroadcastDB();
    this.messageService = new MessageService();
  }
  async createBroadcast(broadcastData: BroadcastDataInput) {
    try {
      const result = await this.broadcastDB.createBroadcast(broadcastData);
      return result;
    } catch (error) {
      console.error('Error occurred while creating broadcast:', error);
      throw error;
    }
  }

  async getBroadcasts() {
    try {
      const broadcasts = await this.broadcastDB.getBroadcasts();
      return broadcasts;
    } catch (error) {
      console.error('Error occurred while fetching broadcasts:', error);
      throw error;
    }
  }

  async getBroadcastById(broadcastId: string) {
    try {
      const broadcast = await this.broadcastDB.getBroadcastById(broadcastId);
      return broadcast;
    } catch (error) {
      console.error('Error occurred while fetching broadcast by ID:', error);
      throw error;
    }
  }

  async deleteBroadcast(broadcastId: string) {
    try {
      const broadcast = await this.broadcastDB.deleteBroadcastById(broadcastId);
      return broadcast;
    } catch (error) {
      console.error('Error occurred while deleting broadcast ID:', error);
      throw error;
    }
  }

  async triggerBroadcast(broadcastId: string) {
    try {
      const broadcast = await this.broadcastDB.getBroadcastById(broadcastId);

      if (!broadcast) {
        throw new Error('Broadcast not found');
      }

      const templateId = broadcast.template_id;
      const templateName = broadcast.template_name;

      const segment = broadcast.segment;

      if (!segment) {
        throw new Error('Segment not found');
      }

      const members = segment.members ?? [];

      for (const member of members) {
        const customer = member.user_id;

        if (!customer?.phone_number) {
          continue;
        }

        await this.messageService.sendTemplate({
          to: customer.phone_number,
          templateName,
        });
      }

      return {
        success: true,
      };
    } catch (error) {
      console.error('Error sending broadcast');
      throw new Error('Error sending broadcast');
    }
  }
}
