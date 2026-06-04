import { automationQueue } from './automation.queue';
import OrderService from '../orders/service';
import { UUID } from 'crypto';
import { AutomationDataInput } from './automation.type';
import { AutomationDB } from './automation.db';

export class AutomationService {
  private automationDB: AutomationDB;

  constructor() {
    this.automationDB = new AutomationDB();
  }

  orderService = new OrderService();
  async triggerFeedbackRequest(crmOrderId: UUID) {
    if (!crmOrderId) {
      console.warn('CRM Order ID is missing. Cannot trigger feedback request.');
      return;
    }

    const order = await this.orderService.getOrderById(crmOrderId);

    if (!order) {
      console.warn(
        `Order with CRM ID ${crmOrderId} not found. Cannot trigger feedback request.`
      );
      return;
    }

    await automationQueue.add(
      'send-template',
      {
        userId: order.userId,
        templateName: 'feedback_collection',
        language: 'en_US',
      },
      {
        delay: 1000 * 10,
        jobId: `feedback-${order.crm_order_id}`,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }
    );
  }

  async createAutomation(automationData: AutomationDataInput) {
    try {
      const result = await this.automationDB.createAutomation(automationData);
      return result;
    } catch (error) {
      console.error('Error occurred while creating automation:', error);
      throw error;
    }
  }

  async getAutomations() {
    try {
      const result = await this.automationDB.getAutomations();
      return result;
    } catch (error) {
      console.error('Error occurred while fetching automations:', error);
      throw error;
    }
  }

  async getAutomationById(automationId: UUID) {
    try {
      const result = await this.automationDB.getAutomationsById(automationId);
      return result;
    } catch (error) {
      console.error('Error occurred while fetching automation:', error);
      throw error;
    }
  }

  async toggleAutomation(automationId: UUID, is_active: boolean) {
    try {
      const result = await this.automationDB.toggleAutomation(
        automationId,
        is_active
      );
      return result;
    } catch (error) {
      console.error('Error occurred while toggling automation:', error);
      throw error;
    }
  }

  async updateAutomation(
    automationId: UUID,
    updateData: Partial<AutomationDataInput>
  ) {
    try {
      const result = await this.automationDB.updateAutomation(
        automationId,
        updateData
      );
      return result;
    } catch (error) {
      console.error('Error occurred while updating automation:', error);
      throw error;
    }
  }
}
