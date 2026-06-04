"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BroadcastService = void 0;
const service_1 = require("../message_service/service");
const broadcast_db_1 = require("./broadcast.db");
class BroadcastService {
    constructor() {
        this.broadcastDB = new broadcast_db_1.BroadcastDB();
        this.messageService = new service_1.MessageService();
    }
    async createBroadcast(broadcastData) {
        try {
            const result = await this.broadcastDB.createBroadcast(broadcastData);
            return result;
        }
        catch (error) {
            console.error('Error occurred while creating broadcast:', error);
            throw error;
        }
    }
    async getBroadcasts() {
        try {
            const broadcasts = await this.broadcastDB.getBroadcasts();
            return broadcasts;
        }
        catch (error) {
            console.error('Error occurred while fetching broadcasts:', error);
            throw error;
        }
    }
    async getBroadcastById(broadcastId) {
        try {
            const broadcast = await this.broadcastDB.getBroadcastById(broadcastId);
            return broadcast;
        }
        catch (error) {
            console.error('Error occurred while fetching broadcast by ID:', error);
            throw error;
        }
    }
    async deleteBroadcast(broadcastId) {
        try {
            const broadcast = await this.broadcastDB.deleteBroadcastById(broadcastId);
            return broadcast;
        }
        catch (error) {
            console.error('Error occurred while deleting broadcast ID:', error);
            throw error;
        }
    }
    async triggerBroadcast(broadcastId) {
        var _a;
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
            const members = (_a = segment.members) !== null && _a !== void 0 ? _a : [];
            for (const member of members) {
                const customer = member.user_id;
                if (!(customer === null || customer === void 0 ? void 0 : customer.phone_number)) {
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
        }
        catch (error) {
            console.error('Error sending broadcast');
            throw new Error('Error sending broadcast');
        }
    }
}
exports.BroadcastService = BroadcastService;
