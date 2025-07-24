import dotenv from "dotenv";
import path from "path";
import Twilio from "twilio";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const client = Twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

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
    // Assume it's a Malaysian number missing leading 0 or 60
    return "+60" + digits;
  }

  // Singaporean numbers
  if (digits.startsWith("65")) {
    return "+" + digits;
  } else if (digits.length === 8 && /^[689]/.test(digits)) {
    // Local SG number without country code (starts with 6, 8, or 9)
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

  // 1. If known courier column is given, trust it
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

  // 2. Fallback to auto-detect via pattern
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
    /^FL/.test(upper) ||
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

  // 3. Default fallback
  return {
    name: "Flash Express (MY)", // Default courier
    link: `https://www.flashexpress.my/fle/tracking?trackNumber=${trackingNumber}`,
  };
}

export async function sendWhatsAppTemplate(
  to: string,
  trackingNumber: string,
  courierCompany?: string
): Promise<string> {
  try {
    const formattedTo = `whatsapp:${formatPhoneNumber(to)}`;
    const detected = detectCourierAndLink(trackingNumber, courierCompany);

    const courier = courierCompany?.trim() || detected.name;
    const link = detected.link || "https://example.com";

    if (!courierCompany) {
      console.log(`ℹ️ No courier provided, fallback to detected: ${courier}`);
    }

    console.log(`📤 Sending WhatsApp to: ${formattedTo}`);
    console.log(`   📋 Tracking: ${trackingNumber}`);
    console.log(`   🚚 Courier: ${courier}`);
    console.log(`   🔗 Link: ${link}`);

    const message = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM!,
      to: formattedTo,
      statusCallback: "https://55166599fec5.ngrok-free.app/twilio/status",
      contentSid: process.env.TWILIO_WHATSAPP_TEMPLATE_ID!,
      contentVariables: JSON.stringify({
        "1": trackingNumber,
        "2": courier,
        "3": link,
      }),
    });

    console.log(`✅ Template message sent to ${formattedTo} via ${courier}`);
    return message.sid;
  } catch (error) {
    console.error(`❌ Failed to send WhatsApp message to ${to}:`, error);
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
    console.log(`   Date Created: ${message.dateCreated}`);
    console.log(`   Date Updated: ${message.dateUpdated}`);

    return message.status;
  } catch (error) {
    console.error("❌ Failed to fetch message status:", error);
    return null;
  }
}

// Helper function to get recent messages for a phone number (alternative approach)
export async function getRecentMessageStatus(
  phoneNumber: string
): Promise<string | null> {
  try {
    const formattedTo = `whatsapp:${formatPhoneNumber(phoneNumber)}`;

    // Get recent messages to this number
    const messages = await client.messages.list({
      to: formattedTo,
      limit: 1,
      dateSentAfter: new Date(Date.now() - 10 * 60 * 1000), // Last 10 minutes
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
