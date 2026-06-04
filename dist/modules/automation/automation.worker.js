"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.automationWorker = void 0;
const bullmq_1 = require("bullmq");
const queue_1 = __importDefault(require("../queue"));
const templates_service_1 = require("../whatsapp/templates/templates.service");
const service_1 = __importDefault(require("../customer/service"));
const whatsappService = new templates_service_1.WhatsappTemplatesService();
const customerService = new service_1.default();
exports.automationWorker = new bullmq_1.Worker('automation', async (job) => {
    console.log('Processing job:', job.name, job.data);
    switch (job.name) {
        case 'send-template': {
            const { userId, templateName, language } = job.data;
            const user = await customerService.getCustomerById(userId);
            if (!user) {
                console.warn(`User with ID ${userId} not found. Skipping template send.`);
                return;
            }
            console.log('User found:', user);
            await whatsappService.sendTemplate({
                to: user.phone_number,
                templateName: templateName,
                language: language,
                variables: [user.name, user.last_order_date],
            });
            break;
        }
        default:
            console.warn('Unknown job type:', job.name);
    }
}, { connection: queue_1.default });
