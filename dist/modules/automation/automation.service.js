"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutomationService = void 0;
const automation_queue_1 = require("./automation.queue");
const service_1 = __importDefault(require("../orders/service"));
const automation_db_1 = require("./automation.db");
class AutomationService {
    constructor() {
        this.orderService = new service_1.default();
        this.automationDB = new automation_db_1.AutomationDB();
    }
    async triggerFeedbackRequest(crmOrderId) {
        if (!crmOrderId) {
            console.warn('CRM Order ID is missing. Cannot trigger feedback request.');
            return;
        }
        const order = await this.orderService.getOrderById(crmOrderId);
        if (!order) {
            console.warn(`Order with CRM ID ${crmOrderId} not found. Cannot trigger feedback request.`);
            return;
        }
        await automation_queue_1.automationQueue.add('send-template', {
            userId: order.userId,
            templateName: 'feedback_collection',
            language: 'en_US',
        }, {
            delay: 1000 * 10,
            jobId: `feedback-${order.crm_order_id}`,
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 2000,
            },
        });
    }
    async createAutomation(automationData) {
        try {
            const result = await this.automationDB.createAutomation(automationData);
            return result;
        }
        catch (error) {
            console.error('Error occurred while creating automation:', error);
            throw error;
        }
    }
    async getAutomations() {
        try {
            const result = await this.automationDB.getAutomations();
            return result;
        }
        catch (error) {
            console.error('Error occurred while fetching automations:', error);
            throw error;
        }
    }
    async getAutomationById(automationId) {
        try {
            const result = await this.automationDB.getAutomationsById(automationId);
            return result;
        }
        catch (error) {
            console.error('Error occurred while fetching automation:', error);
            throw error;
        }
    }
    async toggleAutomation(automationId, is_active) {
        try {
            const result = await this.automationDB.toggleAutomation(automationId, is_active);
            return result;
        }
        catch (error) {
            console.error('Error occurred while toggling automation:', error);
            throw error;
        }
    }
    async updateAutomation(automationId, updateData) {
        try {
            const result = await this.automationDB.updateAutomation(automationId, updateData);
            return result;
        }
        catch (error) {
            console.error('Error occurred while updating automation:', error);
            throw error;
        }
    }
}
exports.AutomationService = AutomationService;
