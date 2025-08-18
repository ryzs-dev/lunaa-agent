// src/whatsappOrderBot.ts
import { google } from "googleapis";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// Initialize Google Sheets API
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON!);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

interface OrderData {
  orderDate: string;
  customerName: string;
  phoneNumber: string;
  products: ProductOrder[];
  address?: string;
  city?: string;
  postcode?: string;
  state?: string;
  totalPaid?: number;
  productCode?: string;
  remark?: string;
  paymentMethod?: string;
  groupName?: string;
  messageId?: string;
  isRepeatCustomer?: boolean;
}

interface ProductOrder {
  name: string;
  quantity: number;
  type?: string;
}

interface MessageContext {
  customerPhone: string;
  customerName?: string;
  groupName?: string;
  messageId?: string;
  timestamp?: string;
}

// Enhanced authorized phone numbers configuration
const AUTHORIZED_PHONE_NUMBERS = process.env.AUTHORIZED_PHONE_NUMBERS
  ? process.env.AUTHORIZED_PHONE_NUMBERS.split(",").map((num) => num.trim())
  : [
      "601126470411",
      "60174941361",
      "60164525013",
      "60127909921",
      "60164561361",
      "601158699901",
      // Test numbers for testing
      "60123456789",
      "60126675705",
      "60127370668",
      "60191234567",
      "60187654321",
    ];

/**
 * Enhanced phone number normalization for Malaysia (+60) and Singapore (+65)
 */
function normalizePhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) return "";

  const digits = phoneNumber.replace(/\D/g, "");

  // Handle Malaysian numbers (+60)
  if (digits.startsWith("60")) {
    return digits;
  } else if (digits.startsWith("0")) {
    return "60" + digits.substring(1);
  } else if (
    digits.length >= 9 &&
    digits.length <= 11 &&
    (digits.startsWith("1") ||
      digits.startsWith("3") ||
      digits.startsWith("4") ||
      digits.startsWith("5") ||
      digits.startsWith("6") ||
      digits.startsWith("7") ||
      digits.startsWith("8") ||
      digits.startsWith("9"))
  ) {
    return "60" + digits;
  }

  // Handle Singaporean numbers (+65)
  if (digits.startsWith("65")) {
    return digits;
  } else if (digits.length === 8 && /^[3689]/.test(digits)) {
    return "65" + digits;
  }

  return digits;
}

/**
 * Enhanced authorization check with better phone number matching
 */
function isAuthorizedPhoneNumber(phoneNumber: string): boolean {
  if (!phoneNumber) return false;

  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  return AUTHORIZED_PHONE_NUMBERS.some((authorizedNumber) => {
    const normalizedAuthorized = normalizePhoneNumber(authorizedNumber);

    if (normalizedPhone === normalizedAuthorized) return true;

    if (
      normalizedPhone.startsWith("60") &&
      normalizedAuthorized.startsWith("60")
    ) {
      return normalizedPhone.substring(2) === normalizedAuthorized.substring(2);
    }

    if (
      normalizedPhone.startsWith("65") &&
      normalizedAuthorized.startsWith("65")
    ) {
      return normalizedPhone.substring(2) === normalizedAuthorized.substring(2);
    }

    return false;
  });
}

/**
 * Enhanced payment method detection
 */
function detectPaymentMethod(text: string): string | null {
  if (!text) return null;

  const textLower = text.toLowerCase().trim();

  const paymentPatterns = [
    { pattern: /\b(cod|cash\s*on\s*delivery)\b/i, method: "COD" },
    {
      pattern: /\b(tng|touch\s*n\s*go|touchngo|touch\s*and\s*go)\b/i,
      method: "TNG",
    },
    {
      pattern: /\b(bank\s*transfer|bank\s*in|transfer|online\s*banking|fpx)\b/i,
      method: "BANK TRANSFER",
    },
    {
      pattern: /\b(card|credit\s*card|debit\s*card|stripe|visa|mastercard)\b/i,
      method: "CARD",
    },
    { pattern: /\b(grab\s*pay|grabpay)\b/i, method: "GRABPAY" },
    { pattern: /\b(boost)\b/i, method: "BOOST" },
    { pattern: /\b(maya|paymaya)\b/i, method: "MAYA" },
    { pattern: /\b(gcash)\b/i, method: "GCASH" },
    { pattern: /\b(cash|tunai)\b/i, method: "CASH" },
  ];

  for (const { pattern, method } of paymentPatterns) {
    if (pattern.test(textLower)) {
      return method;
    }
  }

  return null;
}

/**
 * Enhanced repeat customer detection
 */
function detectRepeatCustomer(text: string): boolean {
  if (!text) return false;

  const textLower = text.toLowerCase();

  const repeatPatterns = [
    /\b\.?rpt\b/i,
    /\brepeat\b/i,
    /\brepeating\b/i,
    /\breturn\s*customer\b/i,
    /\bregular\s*customer\b/i,
    /\bexisting\s*customer\b/i,
    /\bold\s*customer\b/i,
    /\b重复\b/,
    /\b老客户\b/,
    /\b回头客\b/,
  ];

  return repeatPatterns.some((pattern) => pattern.test(textLower));
}

/**
 * Enhanced phone number extraction
 */
function extractPhoneNumber(text: string): string | null {
  if (!text) return null;

  const phonePatterns = [
    /\b(\+?60\s*1[0-9]\s*[0-9]{3,4}\s*[0-9]{4})\b/g,
    /\b(01[0-9]\s*[0-9]{3,4}\s*[0-9]{4})\b/g,
    /\b(\+?60\s*[3-9]\s*[0-9]{3,4}\s*[0-9]{4})\b/g,
    /\b(0[3-9]\s*[0-9]{3,4}\s*[0-9]{4})\b/g,
    /\b(\+?65\s*[689][0-9]{3}\s*[0-9]{4})\b/g,
    /\b([689][0-9]{3}\s*[0-9]{4})\b/g,
    /\b(\+?60\s*1[0-9]-[0-9]{3,4}-[0-9]{4})\b/g,
    /\b(01[0-9]-[0-9]{3,4}-[0-9]{4})\b/g,
    /\b(\+?65\s*[689][0-9]{3}-[0-9]{4})\b/g,
  ];

  for (const pattern of phonePatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      return matches[0].replace(/\s+/g, "");
    }
  }

  return null;
}

/**
 * Extract total amount from text
 */
function extractTotalAmount(text: string): number {
  if (!text) return 0;

  // Pattern 1: total：256 or total: 256 or Total: RM256
  let totalMatch = text.match(/total\s*[：:]\s*(?:rm)?\s*(\d+)/i);

  // Pattern 2: total 256 or Total RM256 (without colon)
  if (!totalMatch) {
    totalMatch = text.match(/total\s+(?:rm\s*)?(\d+)/i);
  }

  // Pattern 3: Just numbers after total (flexible)
  if (!totalMatch) {
    totalMatch = text.match(/total.*?(\d+)/i);
  }

  // Pattern 4: RM prefix
  if (!totalMatch) {
    totalMatch = text.match(/^rm\s*(\d+)$/i);
  }

  // Pattern 5: Amount with currency
  if (!totalMatch) {
    totalMatch = text.match(/(\d{2,4})\s*(ringgit|dollar|myr|sgd)/i);
  }

  // Pattern 6: Standalone amount (if reasonable range)
  if (!totalMatch && text.match(/^\d{2,4}$/)) {
    const amount = parseInt(text);
    if (amount >= 20 && amount <= 9999) {
      return amount;
    }
  }

  return totalMatch ? parseInt(totalMatch[1]) : 0;
}

/**
 * Admin functions
 */
export function addAuthorizedPhoneNumber(phoneNumber: string): boolean {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  if (!isAuthorizedPhoneNumber(normalizedPhone)) {
    AUTHORIZED_PHONE_NUMBERS.push(normalizedPhone);
    console.log(`✅ Added ${normalizedPhone} to authorized numbers`);
    return true;
  }

  console.log(`⚠️ ${normalizedPhone} is already authorized`);
  return false;
}

export function removeAuthorizedPhoneNumber(phoneNumber: string): boolean {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  const index = AUTHORIZED_PHONE_NUMBERS.findIndex(
    (num) => normalizePhoneNumber(num) === normalizedPhone
  );

  if (index !== -1) {
    AUTHORIZED_PHONE_NUMBERS.splice(index, 1);
    console.log(`✅ Removed ${normalizedPhone} from authorized numbers`);
    return true;
  }

  console.log(`⚠️ ${normalizedPhone} was not found in authorized numbers`);
  return false;
}

export function getAuthorizedPhoneNumbers(): string[] {
  return [...AUTHORIZED_PHONE_NUMBERS];
}

export function getUnauthorizedMessage(): string {
  return "Sorry, your phone number is not authorized to place orders through this bot. Please contact the administrator if you believe this is an error.";
}

/**
 * Enhanced order extraction with improved detection patterns
 */
export function extractOrderFromMessage(
  messageBody: string,
  context: MessageContext
): OrderData | null {
  console.log(`🔍 Extracting order from: "${messageBody}"`);

  // First, check if the sender is authorized
  if (!isAuthorizedPhoneNumber(context.customerPhone)) {
    console.log(`❌ Unauthorized phone number: ${context.customerPhone}`);
    console.log(
      `📋 Authorized numbers: ${AUTHORIZED_PHONE_NUMBERS.join(", ")}`
    );
    return null;
  }

  console.log(`✅ Phone number ${context.customerPhone} is authorized`);

  // Check if it's the condensed single-line format
  if (isCondensedFormat(messageBody)) {
    return extractCondensedOrder(messageBody, context);
  }

  // Handle multi-line formats with enhanced detection
  const lines = messageBody
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line);

  if (lines.length < 2) {
    console.log(`❌ Message too short, expected at least 2 lines`);
    return null;
  }

  let orderDate = "";
  let totalPaid = 0;
  let customerName = "";
  let receiverName = "";
  let phoneNumber = "";
  let address = "";
  let city = "";
  let postcode = "";
  let state = "";
  let productCode = "";
  let paymentMethod = "";
  let isRepeatCustomer = false;

  // First pass: detect repeat customer from any line
  const fullText = messageBody.toLowerCase();
  isRepeatCustomer = detectRepeatCustomer(fullText);
  console.log(`🔄 Repeat customer detected: ${isRepeatCustomer}`);

  // Second pass: detect payment method from any line
  paymentMethod = detectPaymentMethod(messageBody) || "";
  if (paymentMethod) {
    console.log(`💳 Payment method detected: ${paymentMethod}`);
  }

  console.log(`📝 Processing ${lines.length} lines:`);
  lines.forEach((line, index) => {
    console.log(`   Line ${index + 1}: "${line}"`);
  });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    console.log(`🔍 Processing line ${i + 1}: "${line}"`);

    // Enhanced date detection - check if line looks like a date
    if (line.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-](\d{2}|\d{4})$/)) {
      orderDate = formatDateToYYYYMMDD(line);
      console.log(`   ✅ Date detected: ${orderDate}`);

      // Check for repeat indicators in the same message
      if (detectRepeatCustomer(messageBody)) {
        isRepeatCustomer = true;
        console.log(`   ✅ Repeat customer detected in message`);
      }
      continue;
    }
    if (
      line.toLowerCase().startsWith("date") &&
      (line.includes(":") || line.includes("："))
    ) {
      const dateContent = line.replace(/^date\s*[：:]\s*/i, "").trim();

      if (detectRepeatCustomer(dateContent)) {
        isRepeatCustomer = true;
        console.log(`   ✅ Repeat customer detected in date line`);
      }

      const cleanDateContent = dateContent
        .replace(/\s+(repeat|rpt).*$/i, "")
        .trim();
      const dateMatch = cleanDateContent.match(
        /^(\d{1,2}[\/\-]\d{1,2}[\/\-](?:\d{2}|\d{4}))$/i
      );
      if (dateMatch) {
        orderDate = formatDateToYYYYMMDD(dateMatch[1]);
        console.log(`   ✅ Date (standardized): ${orderDate}`);
      }
      continue;
    }

    // Enhanced total detection
    if (!totalPaid) {
      const extractedTotal = extractTotalAmount(line);
      if (extractedTotal > 0) {
        totalPaid = extractedTotal;
        console.log(`   ✅ Total detected: ${totalPaid}`);
        continue;
      }
    }

    // Enhanced name detection
    if (
      line.toLowerCase().startsWith("name") &&
      (line.includes(":") || line.includes("："))
    ) {
      let nameContent = line.replace(/^name\s*[：:]\s*/i, "").trim();

      const detectedPayment = detectPaymentMethod(nameContent);
      if (detectedPayment && !paymentMethod) {
        paymentMethod = detectedPayment;
        console.log(`   ✅ Payment method from name: ${paymentMethod}`);
      }

      nameContent = nameContent
        .replace(/\s*[\(（]([^)）]*)[\)）]\s*$/g, "")
        .trim();

      customerName = nameContent;
      console.log(`   ✅ Name (labeled): ${customerName}`);
      continue;
    }

    // Enhanced contact detection
    if (
      line.toLowerCase().startsWith("contact") &&
      (line.includes(":") || line.includes("："))
    ) {
      const contactContent = line.replace(/^contact\s*[：:]\s*/i, "").trim();
      const extractedPhone = extractPhoneNumber(contactContent);
      if (extractedPhone) {
        phoneNumber = normalizePhoneNumber(extractedPhone);
        console.log(`   ✅ Contact (labeled): ${phoneNumber}`);
      }
      continue;
    }

    // Enhanced address detection
    if (
      line.toLowerCase().startsWith("address") &&
      (line.includes(":") || line.includes("："))
    ) {
      address = line.replace(/^address\s*[：:]\s*/i, "").trim();
      console.log(`   📍 Address (labeled): ${address}`);
      continue;
    }

    // Enhanced payment detection
    if (
      line.toLowerCase().startsWith("payment") &&
      (line.includes(":") || line.includes("："))
    ) {
      const paymentContent = line.replace(/^payment\s*[：:]\s*/i, "").trim();
      const detectedPayment = detectPaymentMethod(paymentContent);
      if (detectedPayment) {
        paymentMethod = detectedPayment;
        console.log(`   ✅ Payment (labeled): ${paymentMethod}`);
      }
      continue;
    }

    // Chinese format handling
    if (line.includes("汇款人名字：")) {
      customerName = line.replace("汇款人名字：", "").trim();
      console.log(`   ✅ Sender name (汇款人): ${customerName}`);
      continue;
    }

    if (line.includes("收件人名字：")) {
      receiverName = line.replace("收件人名字：", "").trim();
      console.log(`   ✅ Receiver name (收件人): ${receiverName}`);
      continue;
    }

    if (line.includes("电话号码：")) {
      const phoneContent = line.replace("电话号码：", "").trim();
      const extractedPhone = extractPhoneNumber(phoneContent);
      if (extractedPhone) {
        phoneNumber = normalizePhoneNumber(extractedPhone);
        console.log(`   ✅ Phone number (电话号码): ${phoneNumber}`);
      }
      continue;
    }

    if (line.includes("地址：")) {
      address = line.replace("地址：", "").trim();
      console.log(`   📍 Address (地址): ${address}`);

      const addressComponents = parseAddress(address);
      city = addressComponents.city;
      postcode = addressComponents.postcode;
      state = addressComponents.state;

      console.log(
        `   🏙️ Parsed - City: ${city}, Postcode: ${postcode}, State: ${state}`
      );
      continue;
    }

    // Enhanced phone number detection - prioritize this before address detection
    if (!phoneNumber) {
      const extractedPhone = extractPhoneNumber(line);
      if (extractedPhone) {
        phoneNumber = normalizePhoneNumber(extractedPhone);
        console.log(`   ✅ Phone number detected: ${phoneNumber}`);
        continue;
      }
    }

    // Enhanced customer name detection with payment method extraction
    if (
      !customerName &&
      line.match(/^[A-Za-z\s\(\)（）\-\.]+$/) &&
      !extractPhoneNumber(line)
    ) {
      let tempCustomerName = line.trim();

      const detectedPayment = detectPaymentMethod(tempCustomerName);
      if (detectedPayment && !paymentMethod) {
        paymentMethod = detectedPayment;
        console.log(`   ✅ Payment method from name: ${paymentMethod}`);
      }

      tempCustomerName = tempCustomerName
        .replace(/\s*[\(（]([^)）]*)[\)）]\s*$/g, "")
        .trim();

      customerName = tempCustomerName;
      console.log(`   ✅ Customer name: ${customerName}`);
      continue;
    }

    // Product code detection
    const productCodePattern = /^(\d+[wfs](\d+ml)?)+$/i;
    const isProductCode = productCodePattern.test(line.trim());
    const looksLikeAddress =
      line.includes(",") ||
      line.includes("Jalan") ||
      line.includes("Lorong") ||
      /^\d{5}/.test(line);
    const looksLikePhone = extractPhoneNumber(line) !== null;

    if (isProductCode && !looksLikeAddress && !looksLikePhone) {
      productCode = line.trim();
      console.log(`   ✅ Product code found: ${productCode}`);
      break;
    }

    // Address lines handling - exclude lines that look like amounts
    if (
      !productCode &&
      line &&
      !isProductCode &&
      !line.includes("：") &&
      !line.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-](\d{2}|\d{4})/i) &&
      !detectPaymentMethod(line) &&
      !line.toLowerCase().includes("total") &&
      !line.match(/^(?:rm\s*)?\d{2,4}$/i) &&
      !extractPhoneNumber(line)
    ) {
      address += (address ? ", " : "") + line;
      console.log(`   📍 Address line added: ${line}`);

      const addressComponents = parseAddress(address);
      if (addressComponents.state) {
        state = addressComponents.state;
        postcode = addressComponents.postcode;
        city = addressComponents.city;
        console.log(`   🏛️ State found: ${state}`);
        console.log(`   📮 Postcode found: ${postcode}`);
        console.log(`   🏙️ City found: ${city}`);
      }
      continue;
    }
  }

  // Final pass: If no total found, try to extract from any line
  if (!totalPaid) {
    console.log(`🔍 Final pass: searching for total amount...`);
    for (const line of lines) {
      if (
        line.match(/\d{2,4}/) &&
        !extractPhoneNumber(line) &&
        !line.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]/)
      ) {
        const extractedTotal = extractTotalAmount(line);
        if (extractedTotal > 0) {
          totalPaid = extractedTotal;
          console.log(
            `   ✅ Total found in final pass: ${totalPaid} (from line: "${line}")`
          );
          break;
        }
      }
    }
  }

  const finalCustomerName =
    receiverName || customerName || context.customerName || "WhatsApp Customer";

  const baseRemark = `Order from WhatsApp${
    context.groupName ? ` (Group: ${context.groupName})` : ""
  }${receiverName && customerName ? ` (Sender: ${customerName})` : ""}${
    isRepeatCustomer ? " (Repeat Customer)" : " (New Customer)"
  }`;
  const remarkWithProductCode = productCode
    ? `${baseRemark} - ${productCode}`
    : baseRemark;

  console.log(`✅ Extracted order:`, {
    orderDate,
    customerName: finalCustomerName,
    phoneNumber: phoneNumber || context.customerPhone,
    totalPaid,
    productCode,
    address: address.trim(),
    city,
    postcode,
    state,
    remark: remarkWithProductCode,
    paymentMethod,
    isRepeatCustomer,
  });

  return {
    orderDate: orderDate || new Date().toISOString().split("T")[0],
    customerName: finalCustomerName,
    phoneNumber: phoneNumber || context.customerPhone,
    products: parseProductCode(productCode),
    address: address.trim(),
    city,
    postcode,
    state,
    totalPaid,
    productCode,
    remark: remarkWithProductCode,
    paymentMethod: paymentMethod || undefined,
    groupName: context.groupName,
    messageId: context.messageId,
    isRepeatCustomer: isRepeatCustomer,
  };
}

/**
 * Check if the message is in condensed single-line format
 */
function isCondensedFormat(messageBody: string): boolean {
  const trimmed = messageBody.trim();
  const hasDateAtStart = /^\d{1,2}[\/\-]\d{1,2}[\/\-](\d{2}|\d{4})/.test(
    trimmed
  );
  const lineCount = trimmed.split("\n").filter((line) => line.trim()).length;
  const isSingleLine = lineCount <= 2;
  const hasProductCodeAtEnd =
    /\s+\d+[wfs](\d+ml)?(\d+[wfs](\d+ml)?)*\s*$/i.test(trimmed);

  console.log(
    `📊 Format detection: Lines=${lineCount}, DateAtStart=${hasDateAtStart}, ProductAtEnd=${hasProductCodeAtEnd}`
  );

  return hasDateAtStart && isSingleLine && hasProductCodeAtEnd;
}

/**
 * Enhanced condensed order extraction
 */
function extractCondensedOrder(
  messageBody: string,
  context: MessageContext
): OrderData | null {
  console.log(`🔍 Extracting condensed order format...`);

  const trimmed = messageBody.trim();

  const dateMatch = trimmed.match(
    /^(\d{1,2}[\/\-]\d{1,2}[\/\-](?:\d{2}|\d{4}))(\.?rpt|\.?repeat)?/i
  );
  if (!dateMatch) {
    console.log(`❌ No date found at start`);
    return null;
  }

  const dateStr = dateMatch[1];
  const isRepeat = Boolean(dateMatch[2]) || detectRepeatCustomer(trimmed);
  const orderDate = formatDateToYYYYMMDD(dateStr);

  console.log(`   ✅ Date: ${orderDate}, Repeat: ${isRepeat}`);

  let remaining = trimmed.substring(dateMatch[0].length).trim();

  let paymentMethod = detectPaymentMethod(remaining) || "";
  let totalPaid = 0;

  // Pattern 1: Payment method with amount (cod rm278, bank rm150, tng rm200)
  const paymentMatch = remaining.match(
    /^(cod|bank|cash|transfer|tng|grabpay|boost)\s+rm\s*(\d+)/i
  );
  if (paymentMatch) {
    if (!paymentMethod) {
      paymentMethod =
        detectPaymentMethod(paymentMatch[1]) || paymentMatch[1].toUpperCase();
    }
    totalPaid = parseInt(paymentMatch[2]);
    remaining = remaining.substring(paymentMatch[0].length).trim();
    console.log(
      `   ✅ Payment & Amount: ${paymentMethod}, Amount: ${totalPaid}`
    );
  } else {
    // Pattern 2: Just amount without payment method (rm278, 278)
    const amountMatch = remaining.match(/^(?:rm\s*)?(\d{2,4})\s+/i);
    if (amountMatch) {
      totalPaid = parseInt(amountMatch[1]);
      remaining = remaining.substring(amountMatch[0].length).trim();
      console.log(`   ✅ Amount only: ${totalPaid}`);
    }
  }

  const productCodeMatch = remaining.match(
    /\s+(\d+[wfs](\d+ml)?(\d+[wfs](\d+ml)?)*)\s*$/i
  );
  if (!productCodeMatch) {
    console.log(`❌ No product code found at end`);
    return null;
  }

  const productCode = productCodeMatch[1];
  remaining = remaining
    .substring(0, remaining.length - productCodeMatch[0].length)
    .trim();
  console.log(`   ✅ Product code: ${productCode}`);

  const extractedPhone = extractPhoneNumber(remaining);
  if (!extractedPhone) {
    console.log(`❌ Could not extract phone number`);
    return null;
  }

  const phoneNumber = normalizePhoneNumber(extractedPhone);

  const phoneIndex = remaining.indexOf(extractedPhone);
  let customerName = remaining.substring(0, phoneIndex).trim();
  const addressString = remaining
    .substring(phoneIndex + extractedPhone.length)
    .trim();

  const detectedPaymentFromName = detectPaymentMethod(customerName);
  if (detectedPaymentFromName && !paymentMethod) {
    paymentMethod = detectedPaymentFromName;
    console.log(`   ✅ Payment method from name: ${paymentMethod}`);
  }

  customerName = customerName
    .replace(/\s*[\(（]([^)）]*)[\)）]\s*$/g, "")
    .trim();

  console.log(`   ✅ Customer: ${customerName}`);
  console.log(`   ✅ Phone: ${phoneNumber}`);
  console.log(`   📍 Address: ${addressString}`);

  const addressComponents = parseAddress(addressString);

  const baseRemark = `Order from WhatsApp${
    context.groupName ? ` (Group: ${context.groupName})` : ""
  }${isRepeat ? " (Repeat Customer)" : " (New Customer)"}`;
  const remarkWithProductCode = `${baseRemark} - ${productCode}`;

  const orderData: OrderData = {
    orderDate,
    customerName,
    phoneNumber,
    products: parseProductCode(productCode),
    address: addressString,
    city: addressComponents.city,
    postcode: addressComponents.postcode,
    state: addressComponents.state,
    totalPaid,
    productCode,
    remark: remarkWithProductCode,
    paymentMethod,
    groupName: context.groupName,
    messageId: context.messageId,
    isRepeatCustomer: isRepeat,
  };

  console.log(`✅ Extracted condensed order:`, orderData);
  return orderData;
}

/**
 * Parse product code
 */
function parseProductCode(productCode: string): ProductOrder[] {
  if (!productCode) return [];

  const products: ProductOrder[] = [];
  console.log(`🔍 Parsing product code: "${productCode}"`);

  let remaining = productCode.replace(/\s/g, "").toLowerCase();

  while (remaining.length > 0) {
    console.log(`   Processing remaining: "${remaining}"`);

    let match = remaining.match(/^(\d+)([wfs])(30ml|10ml)/i);

    if (!match) {
      match = remaining.match(/^(\d+)([wfs])/i);
    }

    if (!match) {
      console.log(`   ❌ No match found for: "${remaining}"`);
      break;
    }

    const quantity = parseInt(match[1]);
    const productLetter = match[2].toLowerCase();
    const size = match[3] || "";

    console.log(`   ✅ Found: ${quantity}${productLetter}${size}`);

    switch (productLetter) {
      case "w":
        if (size === "30ml") {
          products.push({ name: "wash_30ml", quantity, type: "30ml" });
        } else {
          products.push({ name: "wash", quantity, type: "" });
        }
        break;
      case "f":
        if (size === "10ml") {
          products.push({ name: "femlift_10ml", quantity, type: "10ml" });
        } else {
          products.push({ name: "femlift_30ml", quantity, type: "30ml" });
        }
        break;
      case "s":
        products.push({ name: "spray", quantity, type: "" });
        break;
      default:
        console.log(`⚠️ Unknown product letter: ${productLetter}`);
    }

    remaining = remaining.substring(match[0].length);
  }

  console.log(`✅ Parsed ${products.length} products:`, products);
  return products;
}

/**
 * Enhanced date formatting with support for different separators
 */
function formatDateToYYYYMMDD(dateStr: string): string {
  const parts = dateStr.split(/[\/\-]/);
  if (parts.length === 3) {
    const day = parts[0].padStart(2, "0");
    const month = parts[1].padStart(2, "0");
    let year = parts[2];

    if (year.length === 2) {
      const yearNum = parseInt(year);
      year = yearNum < 50 ? `20${year}` : `19${year}`;
    }

    return `${year}-${month}-${day}`;
  }
  return new Date().toISOString().split("T")[0];
}

/**
 * Enhanced address parsing with better postcode detection
 */

type ParsedAddress = {
  address: string; // keep full address
  city: string;
  postcode: string;
  state: string;
};

function parseAddress(addressLine: string): ParsedAddress {
  let city = "";
  let postcode = "";
  let state = "";

  const address = addressLine.trim();
  const addressLower = address.toLowerCase();

  // --- Utility regex ---
  const phonePattern = /\b\d{2,3}[\s\-]?\d{3,4}[\s\-]?\d{4}\b/;

  // --- Step 1: Extract postcode (MY: 5 digits, SG: 6 digits) ---
  function extractPostcode(regex: RegExp): string {
    const matches = address.match(regex);
    if (!matches) return "";
    for (const match of matches) {
      const idx = address.indexOf(match);
      const surroundingText = address.substring(
        Math.max(0, idx - 10),
        idx + match.length + 10
      );
      if (!phonePattern.test(surroundingText)) {
        return match;
      }
    }
    return "";
  }

  postcode = extractPostcode(/\b\d{5}\b/g); // Malaysia
  if (!postcode) {
    postcode = extractPostcode(/\b\d{6}\b/g); // Singapore
  }

  // --- Step 2: Detect state/region ---
  const locationStates = [
    {
      name: "Selangor",
      variants: ["selangor", "sel", "shah alam", "pj", "subang", "klang"],
    },
    { name: "Kuala Lumpur", variants: ["kuala lumpur", "kl", "k.l", "k l"] },
    {
      name: "Penang",
      variants: ["penang", "pulau pinang", "pg", "georgetown", "george town"],
    },
    {
      name: "Johor",
      variants: [
        "johor",
        "jb",
        "johor bahru",
        "johor baru",
        "skudai",
        "masai",
        "iskandar puteri",
      ],
    },
    { name: "Perak", variants: ["perak", "ipoh", "taiping", "teluk intan"] },
    { name: "Kedah", variants: ["kedah", "alor setar", "sungai petani"] },
    { name: "Kelantan", variants: ["kelantan", "kota bharu", "kota bahru"] },
    { name: "Terengganu", variants: ["terengganu", "kuala terengganu"] },
    { name: "Pahang", variants: ["pahang", "kuantan", "temerloh"] },
    {
      name: "Negeri Sembilan",
      variants: ["negeri sembilan", "n9", "ns", "seremban", "port dickson"],
    },
    { name: "Melaka", variants: ["melaka", "malacca"] },
    { name: "Perlis", variants: ["perlis", "kangar"] },
    {
      name: "Sabah",
      variants: ["sabah", "kota kinabalu", "sandakan", "tawau"],
    },
    { name: "Sarawak", variants: ["sarawak", "kuching", "miri", "sibu"] },
    { name: "Putrajaya", variants: ["putrajaya", "cyberjaya"] },
    { name: "Labuan", variants: ["labuan"] },
    { name: "Singapore", variants: ["singapore", "sg", "republik singapura"] },
  ];

  for (const stateInfo of locationStates) {
    if (stateInfo.variants.some((v) => addressLower.includes(v))) {
      state = stateInfo.name;
      break;
    }
  }

  // --- Step 3: Detect city ---
  const parts = address
    .split(/[,|\n]/)
    .map((p) => p.trim())
    .filter(Boolean);

  const cityKeywords = [
    "taman",
    "bandar",
    "kampung",
    "kg",
    "pekan",
    "town",
    "shah alam",
    "petaling jaya",
    "pj",
    "subang jaya",
    "seri kembangan",
    "puchong",
    "cheras",
    "ampang",
    "damansara",
    "mont kiara",
    "ttdi",
    "bangsar",
    "mid valley",
    "kl sentral",
    "bukit bintang",
    "georgetown",
    "george town",
    "bayan lepas",
    "butterworth",
    "bukit mertajam",
    "nibong tebal",
    "johor bahru",
    "iskandar puteri",
    "kota kinabalu",
  ];

  function findCity(): string {
    // 1. Look for keywords
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (cityKeywords.some((kw) => lower.includes(kw))) {
        return part.replace(/\d{5,6}.*$/, "").trim();
      }
    }

    // 2. Look around postcode
    if (postcode) {
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].includes(postcode)) {
          // next part is usually city
          if (i + 1 < parts.length) return parts[i + 1];
          // or previous part
          if (i > 0) return parts[i - 1];
        }
      }
    }

    // 3. If state is found, city is often just before it
    if (state) {
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].toLowerCase().includes(state.toLowerCase()) && i > 0) {
          return parts[i - 1];
        }
      }
    }

    return "";
  }

  city = findCity();

  // --- Step 4: Clean up city ---
  if (postcode) city = city.replace(new RegExp(postcode, "g"), "").trim();
  if (state) city = city.replace(new RegExp(state, "gi"), "").trim();
  city = city.replace(/\.$/, "").trim();

  return { address, city, postcode, state };
}

/**
 * Sheet operations
 */
export async function appendOrderToSheet(
  orderData: OrderData
): Promise<{ success: boolean; rowIndex?: number; error?: string }> {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID!;
    const sheetNames = JSON.parse(
      process.env.SHEET_NAMES || '["Test", "Test Aug 25"]'
    );

    console.log(
      `📊 Adding order to Google Sheets (${sheetNames.join(", ")})...`
    );

    let results = [];

    for (const sheetName of sheetNames) {
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!A:AC`,
        });

        const rows = response.data.values || [];
        const nextRow = rows.length + 1;

        if (rows.length === 0) {
          console.log(`⚠️ Sheet "${sheetName}" appears to be empty - skipping`);
          continue;
        }

        const headers = rows[0];
        console.log(
          `📋 Found ${headers.length} headers in "${sheetName}":`,
          headers
        );

        const rowData = createSheetRowData(orderData, headers);

        console.log(
          `📝 Row data prepared for "${sheetName}":`,
          rowData
            .filter((cell, index) =>
              cell !== "" ? `${headers[index]}: ${cell}` : null
            )
            .filter(Boolean)
        );

        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${sheetName}!A:AC`,
          valueInputOption: "RAW",
          requestBody: {
            values: [rowData],
          },
        });

        console.log(`✅ Order added to sheet "${sheetName}" at row ${nextRow}`);
        results.push({ sheetName, success: true, rowIndex: nextRow });
      } catch (sheetError) {
        console.error(
          `❌ Failed to add order to sheet "${sheetName}":`,
          sheetError
        );
        results.push({
          sheetName,
          success: false,
          error:
            sheetError instanceof Error
              ? sheetError.message
              : String(sheetError),
        });
      }
    }

    const successfulSheets = results.filter((r) => r.success);
    if (successfulSheets.length > 0) {
      return {
        success: true,
        rowIndex: successfulSheets[0].rowIndex,
        error:
          results.length > successfulSheets.length
            ? `Successfully added to ${successfulSheets.length}/${results.length} sheets`
            : undefined,
      };
    } else {
      return {
        success: false,
        error: `Failed to add to all sheets: ${results
          .map((r) => r.error)
          .join(", ")}`,
      };
    }
  } catch (error) {
    console.error("❌ Failed to add order to sheets:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function createSheetRowData(
  orderData: OrderData,
  headers: string[]
): any[] {
  const rowData = new Array(headers.length).fill("");

  headers.forEach((header, index) => {
    const headerLower = header.toLowerCase().trim();

    switch (headerLower) {
      case "no":
        break;
      case "order date":
        rowData[index] = orderData.orderDate;
        break;
      case "fbname":
        rowData[index] = orderData.groupName || "";
        break;
      case "name":
        rowData[index] = orderData.customerName;
        break;
      case "payment method":
        rowData[index] = orderData.paymentMethod || "";
        break;
      case "wash":
        const washQty = orderData.products
          .filter((p) => p.name === "wash")
          .reduce((sum, p) => sum + p.quantity, 0);
        if (washQty > 0) rowData[index] = washQty;
        break;
      case "femlift 30ml":
        const femlift30mlQty = orderData.products
          .filter((p) => p.name === "femlift_30ml")
          .reduce((sum, p) => sum + p.quantity, 0);
        if (femlift30mlQty > 0) rowData[index] = femlift30mlQty;
        break;
      case "femlift 10ml":
        const femlift10mlQty = orderData.products
          .filter((p) => p.name === "femlift_10ml")
          .reduce((sum, p) => sum + p.quantity, 0);
        if (femlift10mlQty > 0) rowData[index] = femlift10mlQty;
        break;
      case "wash 30ml":
        const wash30mlQty = orderData.products
          .filter((p) => p.name === "wash_30ml")
          .reduce((sum, p) => sum + p.quantity, 0);
        if (wash30mlQty > 0) rowData[index] = wash30mlQty;
        break;
      case "spray":
        const sprayQty = orderData.products
          .filter((p) => p.name === "spray")
          .reduce((sum, p) => sum + p.quantity, 0);
        if (sprayQty > 0) rowData[index] = sprayQty;
        break;
      case "remark":
      case "remarks":
        rowData[index] = orderData.remark || "";
        break;
      case "package (rm)":
        break;
      case "postage (rm)":
        break;
      case "website/shopee charges (rm)":
        break;
      case "total paid (rm)":
        rowData[index] = orderData.totalPaid || "";
        break;
      case "shipment description":
        rowData[index] = orderData.productCode || "";
        break;
      case "address":
        rowData[index] = orderData.address || "";
        break;
      case "city":
        rowData[index] = orderData.city || "";
        break;
      case "postcode":
        rowData[index] = orderData.postcode || "";
        break;
      case "state":
        rowData[index] = orderData.state || "";
        break;
      case "phone number":
        rowData[index] = orderData.phoneNumber || "";
        break;
      case "tracking number":
        break;
      case "courires company":
      case "courier company":
        break;
      case "new/repeat":
        rowData[index] = orderData.isRepeatCustomer ? "repeat" : "new";
        break;
      case "cash sale receipt":
        break;
      case "agent by / under":
        rowData[index] = "WhatsApp Bot";
        break;
      case "sql system":
        break;
      case "currency":
        const phone = orderData.phoneNumber || "";
        if (phone.startsWith("65")) {
          rowData[index] = "SGD";
        } else {
          rowData[index] = "MYR";
        }
        break;
      case "status":
        rowData[index] = "Pending";
        break;
      default:
        break;
    }
  });

  return rowData;
}
