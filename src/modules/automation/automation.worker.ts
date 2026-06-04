import { Job, Worker } from 'bullmq';
import connection from '../queue';
import { WhatsappTemplatesService } from '../whatsapp/templates/templates.service';
import CustomerService from '../customer/service';

const whatsappService = new WhatsappTemplatesService();
const customerService = new CustomerService();

export const automationWorker = new Worker(
  'automation',
  async (job: Job) => {
    console.log('Processing job:', job.name, job.data);
    switch (job.name) {
      case 'send-template': {
        const { userId, templateName, language } = job.data;

        const user = await customerService.getCustomerById(userId);
        if (!user) {
          console.warn(
            `User with ID ${userId} not found. Skipping template send.`
          );
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
  },
  { connection }
);
