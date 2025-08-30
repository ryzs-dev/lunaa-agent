import { WhatsAppService } from "./whatsapp";

async function main() {
  const waService = new WhatsAppService();

  // Send plain text
  await waService.sendTextMessage("601126470411", "Hello from TypeScript 👋");

  // Send template (hello_world must exist in WhatsApp Manager)
  await waService.sendTemplateMessage("601126470411", {
    name: "hello_world",
    language: { code: "en_US" },
  });
}

main().catch(console.error);
