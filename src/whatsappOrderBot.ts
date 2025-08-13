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
  productCode?: string; // Store the raw product code (e.g., "2f1w30ml")
  remark?: string;
  paymentMethod?: string;
  groupName?: string;
  messageId?: string;
  isRepeatCustomer?: boolean;
}

interface ProductOrder {
  name: string;
  quantity: number;
  type?: string; // e.g., "30ml", "10ml"
}

interface MessageContext {
  customerPhone: string;
  customerName?: string;
  groupName?: string;
  messageId?: string;
  timestamp?: string;
}

// Add authorized phone numbers configuration
// You can also move this to environment variables for better security
const AUTHORIZED_PHONE_NUMBERS = process.env.AUTHORIZED_PHONE_NUMBERS
  ? process.env.AUTHORIZED_PHONE_NUMBERS.split(",").map((num) => num.trim())
  : ["601126470411", "60174941361", "0164525013", "0127909921", "0164561361"];

/**
 * Check if a phone number is authorized to place orders
 */
function isAuthorizedPhoneNumber(phoneNumber: string): boolean {
  if (!phoneNumber) return false;

  // Clean the phone number (remove spaces, dashes, plus signs)
  const cleanPhone = phoneNumber.replace(/[\s\-\+]/g, "");

  // Check against authorized numbers (with and without country code)
  return AUTHORIZED_PHONE_NUMBERS.some((authorizedNumber) => {
    const cleanAuthorized = authorizedNumber.replace(/[\s\-\+]/g, "");

    // Direct match
    if (cleanPhone === cleanAuthorized) return true;

    // Match without country code (60)
    if (
      cleanPhone.startsWith("60") &&
      cleanPhone.substring(2) === cleanAuthorized
    )
      return true;
    if (
      cleanAuthorized.startsWith("60") &&
      cleanAuthorized.substring(2) === cleanPhone
    )
      return true;

    // Match with leading zero handling
    if (
      cleanPhone.startsWith("0") &&
      cleanAuthorized === "60" + cleanPhone.substring(1)
    )
      return true;
    if (
      cleanAuthorized.startsWith("0") &&
      cleanPhone === "60" + cleanAuthorized.substring(1)
    )
      return true;

    return false;
  });
}

/**
 * Add a phone number to the authorized list (for admin use)
 */
export function addAuthorizedPhoneNumber(phoneNumber: string): boolean {
  const cleanPhone = phoneNumber.replace(/[\s\-\+]/g, "");

  if (!isAuthorizedPhoneNumber(cleanPhone)) {
    AUTHORIZED_PHONE_NUMBERS.push(cleanPhone);
    console.log(`✅ Added ${cleanPhone} to authorized numbers`);
    return true;
  }

  console.log(`⚠️ ${cleanPhone} is already authorized`);
  return false;
}

/**
 * Remove a phone number from the authorized list (for admin use)
 */
export function removeAuthorizedPhoneNumber(phoneNumber: string): boolean {
  const cleanPhone = phoneNumber.replace(/[\s\-\+]/g, "");
  const index = AUTHORIZED_PHONE_NUMBERS.findIndex(
    (num) => num.replace(/[\s\-\+]/g, "") === cleanPhone
  );

  if (index !== -1) {
    AUTHORIZED_PHONE_NUMBERS.splice(index, 1);
    console.log(`✅ Removed ${cleanPhone} from authorized numbers`);
    return true;
  }

  console.log(`⚠️ ${cleanPhone} was not found in authorized numbers`);
  return false;
}

/**
 * Get list of all authorized phone numbers
 */
export function getAuthorizedPhoneNumbers(): string[] {
  return [...AUTHORIZED_PHONE_NUMBERS];
}

/**
 * Send a response message for unauthorized users
 */
export function getUnauthorizedMessage(): string {
  return "Sorry, your phone number is not authorized to place orders through this bot. Please contact the administrator if you believe this is an error.";
}

/**
 * Extract order information from WhatsApp message
 * Supports multiple formats:
 *
 * Format 1 (English multi-line):
 * 6/8/2025
 * total：256
 * THAN SIEW PHENG
 * 019-4419638
 * 6 Lorong Vila Indah 7,
 * 14300 Nibong Tebal,
 * Pulau Pinang.
 * 1w1f1s1w30ml
 *
 * Format 2 (Chinese multi-line):
 * 8/8/2025
 * total：198
 * 汇款人名字：CHOW MEI LING
 * 收件人名字：NICOLE CHOW
 * 电话号码：0126675705
 * 地址： C15-2-2, Bayan Villa, Jalan BS2/5, Taman Bukit Serdang, 43300 Seri Kembangan, Selangor.
 * 2f1w30ml
 *
 * Format 3 (Condensed single-line):
 * 8/8/25.rpt Cod rm278 Dorcas Koh (cod) 0127370668 28 jalan sagu 38,Taman daya 81100 jb 3f1w
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

  // Handle multi-line formats (existing logic with improvements)
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

  console.log(`📝 Processing ${lines.length} lines:`);
  lines.forEach((line, index) => {
    console.log(`   Line ${index + 1}: "${line}"`);
  });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    console.log(`🔍 Processing line ${i + 1}: "${line}"`);

    // Check for date with optional .rpt (8/8/25.rpt or 6/8/2025 or 8/8/25，Cod)
    if (!orderDate && line.match(/^\d{1,2}\/\d{1,2}\/(\d{2}|\d{4})/i)) {
      // Handle different date formats:
      // 1. "8/8/25.rpt" - condensed with repeat indicator
      // 2. "6/8/2025" - standard date
      // 3. "8/8/25，Cod" - date with comma and payment method

      let dateMatch = line.match(
        /^(\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4}))(\.rpt)?/i
      );
      if (dateMatch) {
        orderDate = formatDateToYYYYMMDD(dateMatch[1]);
        isRepeatCustomer = Boolean(dateMatch[2]);
        console.log(
          `   ✅ Date found: ${orderDate}, Repeat: ${isRepeatCustomer}`
        );

        // Check if this line also contains payment method after comma
        // e.g., "8/8/25，Cod"
        const paymentInDateLine = line.match(
          /[，,]\s*(cod|bank|cash|transfer)\s*$/i
        );
        if (paymentInDateLine && !paymentMethod) {
          paymentMethod = paymentInDateLine[1].toUpperCase();
          console.log(`   ✅ Payment method from date line: ${paymentMethod}`);
        }
      }
      continue;
    }

    // Check for payment method and amount (Cod rm278, Bank rm150, etc.)
    if (!paymentMethod && line.match(/^(cod|bank|cash|transfer)\s+rm(\d+)$/i)) {
      const paymentMatch = line.match(/^(cod|bank|cash|transfer)\s+rm(\d+)$/i);
      if (paymentMatch) {
        paymentMethod = paymentMatch[1].toUpperCase();
        totalPaid = parseInt(paymentMatch[2]);
        console.log(`   ✅ Payment: ${paymentMethod}, Amount: ${totalPaid}`);
      }
      continue;
    }

    // Line 2: Total amount (total：256)
    if (line.toLowerCase().includes("total") && line.includes("：")) {
      const totalMatch = line.match(/total[：:]\s*(\d+)/i);
      if (totalMatch) {
        totalPaid = parseInt(totalMatch[1]);
        console.log(`   ✅ Total found: ${totalPaid}`);
      }
      continue;
    }

    // Chinese format - 汇款人名字：CHOW MEI LING (Sender name)
    if (line.includes("汇款人名字：")) {
      customerName = line.replace("汇款人名字：", "").trim();
      console.log(`   ✅ Sender name (汇款人): ${customerName}`);
      continue;
    }

    // Chinese format - 收件人名字：NICOLE CHOW (Receiver name)
    if (line.includes("收件人名字：")) {
      receiverName = line.replace("收件人名字：", "").trim();
      console.log(`   ✅ Receiver name (收件人): ${receiverName}`);
      continue;
    }

    // Chinese format - 电话号码：0126675705 (Phone number)
    if (line.includes("电话号码：")) {
      phoneNumber = line.replace("电话号码：", "").trim().replace(/-/g, "");
      console.log(`   ✅ Phone number (电话号码): ${phoneNumber}`);
      continue;
    }

    // Chinese format - 地址：[address] (Address)
    if (line.includes("地址：")) {
      address = line.replace("地址：", "").trim();
      console.log(`   📍 Address (地址): ${address}`);

      // Parse address components
      const addressComponents = parseAddress(address);
      city = addressComponents.city;
      postcode = addressComponents.postcode;
      state = addressComponents.state;

      console.log(
        `   🏙️ Parsed - City: ${city}, Postcode: ${postcode}, State: ${state}`
      );
      continue;
    }

    // Customer name - check for payment method indicators
    if (!customerName && line.match(/^[A-Za-z\s\(\)（）]+$/)) {
      let tempCustomerName = line.trim();

      // Extract payment method from name (handle Chinese parentheses)
      const paymentIndicatorMatch = tempCustomerName.match(
        /\s*[\(（]([^)）]+)[\)）]\s*$/
      );
      if (paymentIndicatorMatch) {
        const indicator = paymentIndicatorMatch[1].toLowerCase();
        if (
          !paymentMethod &&
          (indicator === "cod" ||
            indicator === "bank" ||
            indicator === "cash" ||
            indicator === "transfer")
        ) {
          paymentMethod = indicator.toUpperCase();
          console.log(`   ✅ Payment method from name: ${paymentMethod}`);
        }
        // Remove the payment indicator from customer name
        tempCustomerName = tempCustomerName
          .replace(/\s*[\(（][^)）]*[\)）]\s*$/, "")
          .trim();
      }

      customerName = tempCustomerName;
      console.log(`   ✅ Customer name: ${customerName}`);
      continue;
    }

    // Phone number (019-4419638 or 03-98765432)
    if (
      !phoneNumber &&
      (line.match(/^\d{3}-?\d{7,8}$/) ||
        line.match(/^01\d-?\d{7,8}$/) ||
        line.match(/^0\d-?\d{8}$/))
    ) {
      phoneNumber = line.replace(/-/g, ""); // Remove dashes
      console.log(`   ✅ Phone number: ${phoneNumber}`);
      continue;
    }

    // Product code - store as product code for remarks
    const productCodePattern = /^(\d+[wfs](\d+ml)?)+$/i;
    const isProductCode = productCodePattern.test(line.trim());
    const looksLikeAddress =
      line.includes(",") ||
      line.includes("Jalan") ||
      line.includes("Lorong") ||
      /^\d{5}/.test(line);
    const looksLikePhone = /^\d{2,3}-?\d{7,8}$/.test(line.trim());

    console.log(`   Product code check: "${line}"`);
    console.log(
      `     Matches pattern: ${productCodePattern.test(line.trim())}`
    );
    console.log(
      `     Is product code: ${
        isProductCode && !looksLikeAddress && !looksLikePhone
      }`
    );

    if (isProductCode && !looksLikeAddress && !looksLikePhone) {
      productCode = line.trim(); // Store original format (e.g., "2f1w30ml")
      console.log(`   ✅ Product code found: ${productCode}`);
      break;
    }

    // Address lines (anything that's not a product code and not processed above)
    if (
      !productCode &&
      line &&
      !isProductCode &&
      !line.includes("：") &&
      !line.match(/^\d{1,2}\/\d{1,2}\/(\d{2}|\d{4})/i) &&
      !line.match(/^(cod|bank|cash|transfer)\s+rm(\d+)$/i) &&
      !line.toLowerCase().includes("total")
    ) {
      address += (address ? ", " : "") + line;
      console.log(`   📍 Address line added: ${line}`);

      // Check if this line contains Malaysian state
      const malayStates = [
        "selangor",
        "kuala lumpur",
        "penang",
        "johor",
        "perak",
        "kedah",
        "kelantan",
        "terengganu",
        "pahang",
        "negeri sembilan",
        "melaka",
        "perlis",
        "sabah",
        "sarawak",
        "putrajaya",
        "labuan",
        "pulau pinang",
        "jb", // Johor Bahru abbreviation
        "sel", // Selangor abbreviation
        "kl", // Kuala Lumpur abbreviation
      ];
      const lineHasState = malayStates.some((state) =>
        line.toLowerCase().includes(state)
      );

      if (lineHasState) {
        state = extractState(line);
        console.log(`   🏛️ State found: ${state}`);
        // Extract postcode from address
        const postcodeMatch = address.match(/(\d{5})/);
        if (postcodeMatch) {
          postcode = postcodeMatch[1];
          console.log(`   📮 Postcode found: ${postcode}`);
        }
        // Extract city using improved parsing
        const addressComponents = parseAddress(address);
        city = addressComponents.city;
        console.log(`   🏙️ City found: ${city}`);
      }
      continue;
    }
  }

  // Use receiver name if available (Chinese format), otherwise use customer name
  const finalCustomerName =
    receiverName || customerName || context.customerName || "WhatsApp Customer";

  // Create remark with product code
  const baseRemark = `Order from WhatsApp${
    context.groupName ? ` (Group: ${context.groupName})` : ""
  }${receiverName && customerName ? ` (Sender: ${customerName})` : ""}${
    isRepeatCustomer ? " (Repeat Customer)" : ""
  }`;
  const remarkWithProductCode = productCode
    ? `${baseRemark} - ${productCode}`
    : baseRemark;

  console.log(`✅ Extracted order:`, {
    orderDate,
    customerName: finalCustomerName,
    phoneNumber,
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
    products: parseProductCode(productCode), // Parse the product code into individual products
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
 * Pattern: Date.rpt? PaymentMethod rmAmount CustomerName PhoneNumber Address ProductCode
 */
function isCondensedFormat(messageBody: string): boolean {
  const trimmed = messageBody.trim();

  // Check for date pattern at the beginning (DD/MM/YY or DD/MM/YYYY)
  const hasDateAtStart = /^\d{1,2}\/\d{1,2}\/(\d{2}|\d{4})/.test(trimmed);

  // Check if it's a single line (no newlines or very few)
  const lineCount = trimmed.split("\n").filter((line) => line.trim()).length;
  const isSingleLine = lineCount <= 2;

  // Check for product code pattern at the end
  const hasProductCodeAtEnd =
    /\s+\d+[wfs](\d+ml)?(\d+[wfs](\d+ml)?)*\s*$/i.test(trimmed);

  console.log(
    `📊 Format detection: Lines=${lineCount}, DateAtStart=${hasDateAtStart}, ProductAtEnd=${hasProductCodeAtEnd}`
  );

  return hasDateAtStart && isSingleLine && hasProductCodeAtEnd;
}

/**
 * Extract order from condensed format
 * Example: "8/8/25.rpt Cod rm278 Dorcas Koh (cod) 0127370668 28 jalan sagu 38,Taman daya 81100 jb 3f1w"
 */
function extractCondensedOrder(
  messageBody: string,
  context: MessageContext
): OrderData | null {
  console.log(`🔍 Extracting condensed order format...`);

  const trimmed = messageBody.trim();

  // Extract date (with optional .rpt)
  const dateMatch = trimmed.match(
    /^(\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4}))(\.rpt)?/i
  );
  if (!dateMatch) {
    console.log(`❌ No date found at start`);
    return null;
  }

  const dateStr = dateMatch[1];
  const isRepeat = Boolean(dateMatch[2]);
  const orderDate = formatDateToYYYYMMDD(dateStr);

  console.log(`   ✅ Date: ${orderDate}, Repeat: ${isRepeat}`);

  // Remove the date part and continue parsing
  let remaining = trimmed.substring(dateMatch[0].length).trim();

  // Extract payment method and amount (e.g., "Cod rm278" or "Bank rm150")
  let paymentMethod = "";
  let totalPaid = 0;

  const paymentMatch = remaining.match(/^(cod|bank|cash|transfer)\s+rm(\d+)/i);
  if (paymentMatch) {
    paymentMethod = paymentMatch[1].toUpperCase();
    totalPaid = parseInt(paymentMatch[2]);
    remaining = remaining.substring(paymentMatch[0].length).trim();
    console.log(`   ✅ Payment: ${paymentMethod}, Amount: ${totalPaid}`);
  }

  // Extract product code from the end
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

  // Now we have customer name, phone, and address in the remaining string
  // Strategy: Find phone number first (it's a clear pattern), then split around it
  const phoneMatch = remaining.match(
    /(^.*?)\s+(01\d{8,9}|\d{2,3}-?\d{7,8})\s+(.*$)/
  );
  if (!phoneMatch) {
    console.log(`❌ Could not parse customer name, phone, and address`);
    return null;
  }

  let customerName = phoneMatch[1].trim();
  const phoneNumber = phoneMatch[2].replace(/-/g, "");
  const addressString = phoneMatch[3].trim();

  // Clean up customer name - remove payment method indicators and extract payment method
  // Handle both regular parentheses () and Chinese parentheses （）
  const paymentIndicatorMatch = customerName.match(
    /\s*[\(（]([^)）]+)[\)）]\s*$/
  );
  if (paymentIndicatorMatch) {
    const indicator = paymentIndicatorMatch[1].toLowerCase();
    if (
      indicator === "cod" ||
      indicator === "bank" ||
      indicator === "cash" ||
      indicator === "transfer"
    ) {
      if (!paymentMethod) {
        // Only set if not already extracted from amount section
        paymentMethod = indicator.toUpperCase();
        console.log(`   ✅ Payment method from name: ${paymentMethod}`);
      }
    }
    // Remove the payment indicator from customer name (handle both parentheses types)
    customerName = customerName
      .replace(/\s*[\(（][^)）]*[\)）]\s*$/, "")
      .trim();
  }

  console.log(`   ✅ Customer: ${customerName}`);
  console.log(`   ✅ Phone: ${phoneNumber}`);
  console.log(`   📍 Address: ${addressString}`);

  // Parse address components
  const addressComponents = parseAddress(addressString);

  // Create remark
  const baseRemark = `Order from WhatsApp${
    context.groupName ? ` (Group: ${context.groupName})` : ""
  }${isRepeat ? " (Repeat Customer)" : ""}`;
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
 * Parse product code like "1w1f1s1w30ml" or "3f1w" into individual products
 * Mapping:
 * W = wash (regular)
 * F = femlift 30ml (default)
 * S = spray
 * W30ml = wash 30ml (小瓶wash)
 * F10ml = femlift 10ml (小瓶femlift)
 */
function parseProductCode(productCode: string): ProductOrder[] {
  if (!productCode) return [];

  const products: ProductOrder[] = [];

  console.log(`🔍 Parsing product code: "${productCode}"`);

  // Remove any spaces and convert to lowercase
  let remaining = productCode.replace(/\s/g, "").toLowerCase();

  while (remaining.length > 0) {
    console.log(`   Processing remaining: "${remaining}"`);

    // Try to match patterns in order of specificity:
    // 1. Number + letter + "30ml" or "10ml" (e.g., "1w30ml", "1f10ml")
    // 2. Number + letter (e.g., "1w", "1f", "1s")

    let match = remaining.match(/^(\d+)([wfs])(30ml|10ml)/i);

    if (!match) {
      // Try without ml specification
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

    // Map according to your specification
    switch (productLetter) {
      case "w":
        if (size === "30ml") {
          // W30ml = 小瓶wash = Wash 30ml column
          products.push({ name: "wash_30ml", quantity, type: "30ml" });
        } else {
          // W = wash = wash column
          products.push({ name: "wash", quantity, type: "" });
        }
        break;
      case "f":
        if (size === "10ml") {
          // F10ml = 小瓶femlift = Femlift 10ml column
          products.push({ name: "femlift_10ml", quantity, type: "10ml" });
        } else {
          // F = femlift = Femlift 30ml column (default)
          products.push({ name: "femlift_30ml", quantity, type: "30ml" });
        }
        break;
      case "s":
        // S = spray = Spray column
        products.push({ name: "spray", quantity, type: "" });
        break;
      default:
        console.log(`⚠️ Unknown product letter: ${productLetter}`);
    }

    // Remove the matched part and continue
    remaining = remaining.substring(match[0].length);
  }

  console.log(`✅ Parsed ${products.length} products:`, products);
  return products;
}

/**
 * Format date from DD/MM/YYYY or DD/MM/YY to YYYY-MM-DD
 */
function formatDateToYYYYMMDD(dateStr: string): string {
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const day = parts[0].padStart(2, "0");
    const month = parts[1].padStart(2, "0");
    let year = parts[2];

    // Handle 2-digit years (assume 20xx if YY < 50, else 19xx)
    if (year.length === 2) {
      const yearNum = parseInt(year);
      year = yearNum < 50 ? `20${year}` : `19${year}`;
    }

    return `${year}-${month}-${day}`;
  }
  return new Date().toISOString().split("T")[0]; // Fallback to today
}

/**
 * Parse address components from a single address line
 */
function parseAddress(addressLine: string): {
  city: string;
  postcode: string;
  state: string;
} {
  let city = "";
  let postcode = "";
  let state = "";

  // Extract postcode (5-digit number)
  const postcodeMatch = addressLine.match(/(\d{5})/);
  if (postcodeMatch) {
    postcode = postcodeMatch[1];
  }

  // Extract state (common abbreviations and full names)
  const malayStates = [
    { name: "Selangor", variants: ["selangor", "sel"] },
    { name: "Kuala Lumpur", variants: ["kuala lumpur", "kl"] },
    { name: "Penang", variants: ["penang", "pulau pinang", "pg"] },
    { name: "Johor", variants: ["johor", "jb", "johor bahru"] },
    { name: "Perak", variants: ["perak"] },
    { name: "Kedah", variants: ["kedah"] },
    { name: "Kelantan", variants: ["kelantan"] },
    { name: "Terengganu", variants: ["terengganu"] },
    { name: "Pahang", variants: ["pahang"] },
    { name: "Negeri Sembilan", variants: ["negeri sembilan", "n9", "ns"] },
    { name: "Melaka", variants: ["melaka", "malacca"] },
    { name: "Perlis", variants: ["perlis"] },
    { name: "Sabah", variants: ["sabah"] },
    { name: "Sarawak", variants: ["sarawak"] },
    { name: "Putrajaya", variants: ["putrajaya"] },
    { name: "Labuan", variants: ["labuan"] },
  ];

  const addressLower = addressLine.toLowerCase();
  for (const stateInfo of malayStates) {
    for (const variant of stateInfo.variants) {
      if (addressLower.includes(variant)) {
        state = stateInfo.name;
        break;
      }
    }
    if (state) break;
  }

  // Extract city - split by comma and look for the part containing "Taman", "Bandar", etc.
  // For "28 jalan sagu 38,Taman daya 81100 jb" -> City should be "Taman daya"
  const parts = addressLine.split(",").map((part) => part.trim());

  // Look for common city/area prefixes in Malaysian addresses
  const cityPrefixes = [
    "taman",
    "bandar",
    "kampung",
    "kg",
    "shah alam",
    "petaling jaya",
    "pj",
    "seri kembangan",
    "subang jaya",
  ];

  for (const part of parts) {
    const partLower = part.toLowerCase();

    // Check if this part contains common city prefixes
    for (const prefix of cityPrefixes) {
      if (partLower.includes(prefix)) {
        // Extract just the city name part, removing postcode and state
        city = part.replace(/\d{5}.*$/, "").trim(); // Remove postcode and everything after
        if (state) {
          city = city.replace(new RegExp(state, "gi"), "").trim(); // Remove state name
        }
        return { city, postcode, state };
      }
    }
  }

  // Special handling for multi-word cities like "seri kembangan"
  const addressLowerWords = addressLine.toLowerCase().split(/\s+/);
  for (let i = 0; i < addressLowerWords.length - 1; i++) {
    const twoWordCombo = `${addressLowerWords[i]} ${addressLowerWords[i + 1]}`;
    const multiWordCities = [
      "seri kembangan",
      "petaling jaya",
      "shah alam",
      "subang jaya",
      "bandar baru",
      "taman desa",
    ];

    if (multiWordCities.includes(twoWordCombo)) {
      // Get the original case version
      const originalWords = addressLine.split(/\s+/);
      city = `${originalWords[i]} ${originalWords[i + 1]}`;
      return { city, postcode, state };
    }
  }

  // Fallback: look for the part that contains the postcode, the previous part is likely the city
  for (let i = 0; i < parts.length; i++) {
    if (/\d{5}/.test(parts[i])) {
      if (i > 0) {
        // Previous part is likely the city
        city = parts[i - 1].trim();
      } else {
        // Postcode is in the first part, extract city from before the postcode
        const beforePostcode = parts[i].replace(/\d{5}.*$/, "").trim();
        if (beforePostcode) {
          city = beforePostcode;
        }
      }
      break;
    }
  }

  // Clean up city name - remove any remaining numbers or state references
  city = city.replace(/\d{5}/, "").trim().replace(/\.$/, "");
  if (state) {
    city = city.replace(new RegExp(state, "gi"), "").trim();
  }

  return { city, postcode, state };
}

/**
 * Extract state from address line (for English format backward compatibility)
 */
function extractState(line: string): string {
  const malayStates = [
    { name: "Selangor", variants: ["selangor", "sel"] },
    { name: "Kuala Lumpur", variants: ["kuala lumpur", "kl"] },
    { name: "Penang", variants: ["penang", "pulau pinang", "pg"] },
    { name: "Johor", variants: ["johor", "jb", "johor bahru"] },
    { name: "Perak", variants: ["perak"] },
    { name: "Kedah", variants: ["kedah"] },
    { name: "Kelantan", variants: ["kelantan"] },
    { name: "Terengganu", variants: ["terengganu"] },
    { name: "Pahang", variants: ["pahang"] },
    { name: "Negeri Sembilan", variants: ["negeri sembilan", "n9", "ns"] },
    { name: "Melaka", variants: ["melaka", "malacca"] },
    { name: "Perlis", variants: ["perlis"] },
    { name: "Sabah", variants: ["sabah"] },
    { name: "Sarawak", variants: ["sarawak"] },
    { name: "Putrajaya", variants: ["putrajaya"] },
    { name: "Labuan", variants: ["labuan"] },
  ];

  const lineLower = line.toLowerCase();
  for (const state of malayStates) {
    for (const variant of state.variants) {
      if (lineLower.includes(variant)) {
        return state.name;
      }
    }
  }

  return line.trim(); // Return original if no match
}

/**
 * Append order to Google Sheets
 */
export async function appendOrderToSheet(
  orderData: OrderData
): Promise<{ success: boolean; rowIndex?: number; error?: string }> {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID!;
    const sheetName = "Test"; // Your specified sheet name

    console.log(`📊 Adding order to Google Sheets (${sheetName})...`);

    // Get current sheet data to determine next row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:AC`,
    });

    const rows = response.data.values || [];
    const nextRow = rows.length + 1;

    if (rows.length === 0) {
      throw new Error("Sheet appears to be empty - no headers found");
    }

    const headers = rows[0];
    console.log(`📋 Found ${headers.length} headers:`, headers);

    // Create row data based on your sheet structure
    const rowData = createSheetRowData(orderData, headers);

    console.log(
      `📝 Row data prepared:`,
      rowData
        .filter((cell, index) =>
          cell !== "" ? `${headers[index]}: ${cell}` : null
        )
        .filter(Boolean)
    );

    // Append the new row
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:AC`,
      valueInputOption: "RAW",
      requestBody: {
        values: [rowData],
      },
    });

    console.log(`✅ Order added to sheet "${sheetName}" at row ${nextRow}`);

    return { success: true, rowIndex: nextRow };
  } catch (error) {
    console.error("❌ Failed to add order to sheet:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Create row data array based on sheet headers
 * Headers: No, Order Date, fbname, Name, Payment method, wash, Femlift 30ml, Femlift 10ml, Wash 30ml, Spray, remark, package (rm), Postage (rm), Website/shopee charges (rm), TOTAL PAID (rm), shipment description, address, city, postcode, state, phone number, tracking number, courires company, new/repeat, cash sale receipt, Agent by / under, sql system, currency, status
 */
export function createSheetRowData(
  orderData: OrderData,
  headers: string[]
): any[] {
  const rowData = new Array(headers.length).fill("");

  // Map data to correct columns based on headers
  headers.forEach((header, index) => {
    const headerLower = header.toLowerCase().trim();

    switch (headerLower) {
      case "no":
        // Leave empty - will be auto-numbered or handled by sheets
        break;
      case "order date":
        rowData[index] = orderData.orderDate;
        break;
      case "fbname":
        // Could map to customer name if needed
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
        // Include the product code in remarks
        const remarkText = orderData.remark || "";
        rowData[index] = remarkText;
        break;
      case "package (rm)":
        // Could be calculated from products or left empty
        break;
      case "postage (rm)":
        // Could be calculated or left empty
        break;
      case "website/shopee charges (rm)":
        // Leave empty for WhatsApp orders
        break;
      case "total paid (rm)":
        rowData[index] = orderData.totalPaid || "";
        break;
      case "shipment description":
        // Just use the product code as-is for shipment description
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
        // Leave empty - to be filled later
        break;
      case "courires company":
      case "courier company":
        // Leave empty - to be filled later
        break;
      case "new/repeat":
        // Use the isRepeatCustomer flag from the order data
        rowData[index] = orderData.isRepeatCustomer ? "repeat" : "new";
        break;
      case "cash sale receipt":
        // Leave empty
        break;
      case "agent by / under":
        rowData[index] = "WhatsApp Bot";
        break;
      case "sql system":
        // Leave empty or add system identifier
        break;
      case "currency":
        rowData[index] = "MYR"; // Assume Malaysian Ringgit
        break;
      case "status":
        rowData[index] = "pending"; // Default status for new orders
        break;
      default:
        // Leave other columns empty
        break;
    }
  });

  return rowData;
}
