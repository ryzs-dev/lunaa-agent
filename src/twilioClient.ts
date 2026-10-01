import dotenv from "dotenv";
import path from "path";
import Twilio from "twilio";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const client = Twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

// Get webhook URL from environment or disable it
const getWebhookUrl = (): string | undefined => {
  const webhookUrl = process.env.TWILIO_WEBHOOK_URL;

  if (!webhookUrl) {
    console.log("ℹ️ No TWILIO_WEBHOOK_URL set, status callbacks disabled");
    return undefined;
  }

  // Validate URL format
  try {
    new URL(webhookUrl);
    console.log(`🔗 Using webhook URL: ${webhookUrl}`);
    return webhookUrl;
  } catch (error) {
    console.warn(
      `⚠️ Invalid TWILIO_WEBHOOK_URL: ${webhookUrl}, disabling callbacks`
    );
    return undefined;
  }
};

function formatPhoneNumber(number: string): string {
  const digits = number.replace(/\D/g, "");

  // Malaysian numbers
  if (digits.startsWith("60")) {
    return "+" + digits;
  } else if (digits.startsWith("0")) {
    return "+60" + digits.substring(1);
  } else if (
    digits.length >= 9 &&
    (digits.startsWith("1") || digits.startsWith("3") || digits.startsWith("8"))
  ) {
    return "+60" + digits;
  }

  // Singaporean numbers
  if (digits.startsWith("65")) {
    return "+" + digits;
  } else if (digits.length === 8 && /^[689]/.test(digits)) {
    return "+65" + digits;
  }

  throw new Error(
    `Invalid Malaysian or Singaporean phone number format: ${number}`
  );
}

function detectCourierAndLink(
  trackingNumber: string,
  courier?: string
): {
  name: string;
  link: string;
} {
  const upper = trackingNumber.toUpperCase();
  const courierLower = courier?.toLowerCase() || "";

  if (courierLower.includes("sf")) {
    return {
      name: "SF Express (SG)",
      link: `https://www.sf-international.com/us/en/dynamic_function/waybill/#search/bill-number/${trackingNumber}`,
    };
  }

  if (courierLower.includes("spx") || courierLower.includes("shopee")) {
    return {
      name: "SPX (Shopee Express)",
      link: `https://spx.com.my/track?tracking_number=${trackingNumber}`,
    };
  }

  if (courierLower.includes("flash")) {
    return {
      name: "Flash Express (MY)",
      link: `https://www.flashexpress.my/fle/tracking?trackNumber=${trackingNumber}`,
    };
  }

  if (courierLower.includes("best")) {
    return {
      name: "Best Express",
      link: `https://www.tracking.my/best/${trackingNumber}`,
    };
  }

  if (courierLower.includes("j&t") || courierLower.includes("jnt")) {
    return {
      name: "J&T Express",
      link: `https://www.jtexpress.my/index/query/gzquery.html?billcode=${trackingNumber}`,
    };
  }

  if (courierLower.includes("dhl")) {
    return {
      name: "DHL",
      link: `https://www.dhl.com/my-en/home/tracking.html?tracking-id=${trackingNumber}`,
    };
  }

  if (
    courierLower.includes("poslaju") ||
    courierLower.includes("pos laju") ||
    courierLower.includes("pos malaysia")
  ) {
    return {
      name: "Pos Laju",
      link: `https://www.pos.com.my/v2/track-trace?trackNo=${trackingNumber}`,
    };
  }

  if (courierLower.includes("ninjavan") || courierLower.includes("ninja van")) {
    return {
      name: "Ninja Van",
      link: `https://www.ninjavan.co/en-my/tracking?id=${trackingNumber}`,
    };
  }

  if (courierLower.includes("citylink") || courierLower.includes("city-link")) {
    return {
      name: "City-Link Express",
      link: `https://www.citylinkexpress.com/tracking-result/?track0=${trackingNumber}`,
    };
  }

  const trackingMy: [string[], string, string][] = [
    [["kex"], "kex", "KEX Express"],
    [["lineclear", "line clear"], "lineclear", "Line Clear Express"],
    [["aramex"], "aramex", "Aramex"],
    [["lex", "lazada"], "lex", "Lazada Express"],
  ];
  for (const [needles, slug, name] of trackingMy) {
    if (needles.some((n) => courierLower === n || courierLower.includes(n))) {
      return { name, link: `https://www.tracking.my/${slug}/${trackingNumber}` };
    }
  }

  // Auto-detect patterns
  if (/^SF/.test(upper)) {
    return {
      name: "SF Express (SG)",
      link: `https://www.sf-international.com/us/en/dynamic_function/waybill/#search/bill-number/${trackingNumber}`,
    };
  }

  if (
    /^SPX/.test(upper) ||
    (/^\d{14}$/.test(upper) && upper.startsWith("11"))
  ) {
    return {
      name: "SPX (Shopee Express)",
      link: `https://spx.com.my/track?tracking_number=${trackingNumber}`,
    };
  }

  if (
    /^M/.test(upper) ||
    (/^\d{12}$/.test(upper) && trackingNumber.startsWith("88")) ||
    /^M\d{6}[A-Z0-9]+$/.test(upper)
  ) {
    return {
      name: "Flash Express (MY)",
      link: `https://www.flashexpress.my/fle/tracking?trackNumber=${trackingNumber}`,
    };
  }

  if (/^JT/.test(upper) || /^MY\d{10}$/.test(upper)) {
    return {
      name: "J&T Express",
      link: `https://www.jtexpress.my/index/query/gzquery.html?billcode=${trackingNumber}`,
    };
  }

  return {
    name: "Flash Express (MY)",
    link: `https://www.flashexpress.my/fle/tracking?trackNumber=${trackingNumber}`,
};
}

// Send tracking template
export async function sendWhatsAppTemplate(
  to: string,
  trackingNumber: string,
  courierCompany?: string
): Promise<string> {
  try {
    const formattedTo = `whatsapp:${formatPhoneNumber(to)}`;
    const detected = detectCourierAndLink(trackingNumber, courierCompany);
    const webhookUrl = getWebhookUrl();

    const courier = courierCompany?.trim() || detected.name;
    const link = detected.link || "https://example.com";

    console.log(`📤 Sending tracking WhatsApp to: ${formattedTo}`);
    console.log(`   📋 Tracking: ${trackingNumber}`);
    console.log(`   🚚 Courier: ${courier}`);
    console.log(`   🔗 Link: ${link}`);

    const messageParams: any = {
      messagingServiceSid:
        process.env.TWILIO_MESSAGING_SERVICE_SID ||
        "MG8d0a3d7bfbafbbc2b04603198f64b71e",
      to: formattedTo,
      contentSid: process.env.TWILIO_WHATSAPP_TEMPLATE_ID!,
      contentVariables: JSON.stringify({
        "1": trackingNumber,
        "2": courier,
        "3": link,
      }),
    };

    // Add statusCallback only if webhook URL is available
    if (webhookUrl) {
      messageParams.statusCallback = webhookUrl;
    }

    const message = await client.messages.create(messageParams);

    console.log(
      `✅ Tracking template message sent to ${formattedTo} via Messaging Service`
    );
    return message.sid;
  } catch (error) {
    console.error(
      `❌ Failed to send tracking WhatsApp message to ${to}:`,
      error
    );
    throw error;
  }
}

/**
 * Send a plain text WhatsApp message (without template)
 * @param to - Phone number to send to
 * @param messageBody - The text message to send
 * @returns Message SID
 */
export async function sendWhatsAppTextMessage(
  to: string,
  messageBody: string
): Promise<string> {
  try {
    const formattedTo = `whatsapp:${formatPhoneNumber(to)}`;
    const webhookUrl = getWebhookUrl();

    console.log(`📤 Sending WhatsApp text message to: ${formattedTo}`);
    console.log(`📝 Message preview: ${messageBody.substring(0, 100)}...`);

    const messageParams: any = {
      messagingServiceSid:
        process.env.TWILIO_MESSAGING_SERVICE_SID ||
        "MG8d0a3d7bfbafbbc2b04603198f64b71e",
      to: formattedTo,
      body: messageBody,
    };

    // Add statusCallback only if webhook URL is available
    if (webhookUrl) {
      messageParams.statusCallback = webhookUrl;
    }

    const message = await client.messages.create(messageParams);

    console.log(`✅ Text message sent to ${formattedTo}`);
    return message.sid;
  } catch (error) {
    console.error(`❌ Failed to send WhatsApp text message to ${to}:`, error);
    throw error;
  }
}

/**
 * Send the product usage instructions message
 * @param to - Phone number to send to
 * @returns Message SID
 */
export async function sendProductUsageInstructions(
  to: string
): Promise<string> {
  const usageInstructions = `以下是产品用法：

✨ 红色-Lunaa Foam Wash 泡泡慕斯用法 ✨ 
每天使用 2次 ，挤 2 PUMP 的 Lunaa Foam Wash 就足够了哦
月经期间可用至3次 ☑️
--------------------------------------------------------------------

✨ 紫色- Lunaa FemLift 紧致精华液用法 ✨
请直接擦到里面去，擦外面没效果
⛔️月经期间停用 
无需冲洗
.
每天使用2次，早晚使用（洗澡后使用为最佳）
行房前30分钟可再用一次
取10sen大小的量，然后直接擦进去阴道里面 
--------------------------------------------------------------------

✨ 蓝色-Lunaa Intimist私密喷雾 ✨ 
喷1-2下于私密处 / 内裤 / 卫生棉
✅ 无需冲洗
✅ 无需擦拭
✅ 不限次数，随时随地都能使用

✨ 适用场景：
☑️ 月经期间
☑️ 上厕所后
☑️ 私密处搔痒不适
☑️ 天气闷热
☑️ 运动后`;

  return await sendWhatsAppTextMessage(to, usageInstructions);
}

// Send product usage guide template
export async function sendProductUsageGuide(to: string): Promise<string> {
  try {
    const formattedTo = `whatsapp:${formatPhoneNumber(to)}`;
    const webhookUrl = getWebhookUrl();

    console.log(`📤 Sending product usage guide to: ${formattedTo}`);
    console.log(`Using Content SID = ${process.env.TWILIO_PRODUCT_USAGE_GUIDE}`)

    const messageParams: any = {
      messagingServiceSid:
        process.env.TWILIO_MESSAGING_SERVICE_SID ||
        "MG8d0a3d7bfbafbbc2b04603198f64b71e",
      to: formattedTo,
      contentSid: `${process.env.TWILIO_PRODUCT_USAGE_GUIDE}`,
    };

    if (webhookUrl) {
      messageParams.statusCallback = webhookUrl;
    }

    const message = await client.messages.create(messageParams);

    console.log(
      `✅ Product usage guide sent to ${formattedTo} via Messaging Service`
    );
    return message.sid;
  } catch (error) {
    console.error(`❌ Failed to send product usage guide to ${to}:`, error);
    throw error;
  }
}

// Send product usage video as media message
export async function sendProductUsageVideo(to: string): Promise<string> {
  try {
    const formattedTo = `whatsapp:${formatPhoneNumber(to)}`;
    const videoUrl =
      "https://pub-65511469d2a34a99b9509753f9ac0434.r2.dev/lunaa-product-usage-guide.MP4";
    const webhookUrl = getWebhookUrl();

    console.log(`📤 Sending product usage video to: ${formattedTo}`);
    console.log(`🎥 Video URL: ${videoUrl}`);

    const messageParams: any = {
      messagingServiceSid:
        process.env.TWILIO_MESSAGING_SERVICE_SID ||
        "MG8d0a3d7bfbafbbc2b04603198f64b71e",
      to: formattedTo,
      body: "Here's your product usage guide video! 🎥",
      mediaUrl: [videoUrl],
    };

    if (webhookUrl) {
      messageParams.statusCallback = webhookUrl;
    }

    const message = await client.messages.create(messageParams);

    console.log(
      `✅ Product usage video sent to ${formattedTo} via Messaging Service`
    );
    return message.sid;
  } catch (error) {
    console.error(`❌ Failed to send product usage video to ${to}:`, error);
    throw error;
  }
}

// Send complete message sequence
export async function sendCompleteMessageSequence(
  to: string,
  trackingNumber: string,
  courierCompany?: string,
  options: {
    includeUsageGuide?: boolean;
    includeUsageVideo?: boolean;
    delayBetweenMessages?: number;
  } = {}
): Promise<{
  trackingSid: string;
  usageGuideSid?: string;
  usageVideoSid?: string;
}> {
  const {
    includeUsageGuide = false,
    includeUsageVideo = false,
    delayBetweenMessages = 30000,
  } = options;

  const result: {
    trackingSid: string;
    usageGuideSid?: string;
    usageVideoSid?: string;
  } = {
    trackingSid: "",
  };

  try {
    console.log(`🚀 Starting message sequence for ${to}`);
    result.trackingSid = await sendWhatsAppTemplate(
      to,
      trackingNumber,
      courierCompany
    );

    if (includeUsageGuide || includeUsageVideo) {
      console.log(
        `⏱️ Waiting ${
          delayBetweenMessages / 1000
        } seconds before next message...`
      );
      await new Promise((resolve) => setTimeout(resolve, delayBetweenMessages));
    }

    if (includeUsageGuide) {
      result.usageGuideSid = await sendProductUsageGuide(to);

      if (includeUsageVideo) {
        console.log(
          `⏱️ Waiting ${delayBetweenMessages / 1000} seconds before video...`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, delayBetweenMessages)
        );
      }
    }

    if (includeUsageVideo) {
      result.usageVideoSid = await sendProductUsageVideo(to);
    }

    console.log(`✅ Complete message sequence sent to ${to}:`, result);
    return result;
  } catch (error) {
    console.error(
      `❌ Failed to send complete message sequence to ${to}:`,
      error
    );
    throw error;
  }
}

export async function getMessageStatusBySid(
  messageSid: string
): Promise<string | null> {
  try {
    console.log(`🔍 Checking status for message SID: ${messageSid}`);
    const message = await client.messages(messageSid).fetch();

    console.log(`📊 Message details:`);
    console.log(`   Status: ${message.status}`);
    console.log(`   Error Code: ${message.errorCode || "none"}`);
    console.log(`   Error Message: ${message.errorMessage || "none"}`);

    return message.status;
  } catch (error) {
    console.error("❌ Failed to fetch message status:", error);
    return null;
  }
}

export async function getRecentMessageStatus(
  phoneNumber: string
): Promise<string | null> {
  try {
    const formattedTo = `whatsapp:${formatPhoneNumber(phoneNumber)}`;

    const messages = await client.messages.list({
      to: formattedTo,
      limit: 1,
      dateSentAfter: new Date(Date.now() - 10 * 60 * 1000),
    });

    if (messages.length > 0) {
      return messages[0].status;
    }

    return null;
  } catch (error) {
    console.error("❌ Failed to fetch recent message status:", error);
    return null;
  }
}

export async function getMessagingService() {
  const services = await client.messaging.v1.services.list({ limit: 20 });
  return services.map((s) => ({
    sid: s.sid,
    friendlyName: s.friendlyName,
    accountSid: s.accountSid,
    dateCreated: s.dateCreated,
    dateUpdated: s.dateUpdated,
  }));
}
