import { language } from 'googleapis/build/src/apis/language';
import { automationQueue } from './automation.queue';

async function run() {
  await automationQueue.add('send-template', {
    userId: '152f58bb-a2d8-48fd-8b65-de1ed5772f54',
    templateName: 'feedback_collection',
    language: 'en_US',
  });

  console.log('Job sent');
}

run();
