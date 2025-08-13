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

// Enhanced authorized phone numbers configuration
const AUTHORIZED_PHONE_NUMBERS = process.env.AUTHORIZED_PHONE_NUMBERS
  ? process.env.AUTHORIZED_PHONE_NUMBERS.split(",").map((num) => num.trim())
  : [
      "601126470411",
      "60174941361", 
      "60164525013",
      "60127909921",
      "60164561361",
    ];

/**
 * Enhanced phone number normalization for Malaysia (+60) and Singapore (+65)
 */
function normalizePhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) return "";

  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, "");

  // Handle Malaysian numbers (+60)
  if (digits.startsWith("60")) {
    return digits; // Already has country code
  } else if (digits.startsWith("0")) {
    return "60" + digits.substring(1); // Remove leading 0, add 60
  } else if (digits.length >= 9 && digits.length <= 11 && 
             (digits.startsWith("1") || digits.startsWith("3") || 
              digits.startsWith("4") || digits.startsWith("5") || 
              digits.startsWith("6") || digits.startsWith("7") || 
              digits.startsWith("8") || digits.startsWith("9"))) {
    return "60" + digits; // Malaysian mobile/landline without country code
  }

  // Handle Singaporean numbers (+65)
  if (digits.startsWith("65")) {
    return digits; // Already has country code
  } else if (digits.length === 8 && /^[3689]/.test(digits)) {
    return "65" + digits; // Singapore number without country code
  }

  // Return as-is if can't determine format
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
    
    // Direct match
    if (normalizedPhone === normalizedAuthorized) return true;
    
    // Match with both having country codes
    if (normalizedPhone.startsWith("60") && normalizedAuthorized.startsWith("60")) {
      return normalizedPhone.substring(2) === normalizedAuthorized.substring(2);
    }
    
    if (normalizedPhone.startsWith("65") && normalizedAuthorized.startsWith("65")) {
      return normalizedPhone.substring(2) === normalizedAuthorized.substring(2);
    }
    
    return false;
  });
}

/**
 * Enhanced payment method detection with more comprehensive patterns
 */
function detectPaymentMethod(text: string): string | null {
  if (!text) return null;
  
  const textLower = text.toLowerCase().trim();
  
  // Enhanced payment method patterns
  const paymentPatterns = [
    // Cash on Delivery
    { pattern: /\b(cod|cash\s*on\s*delivery)\b/i, method: "COD" },
    
    // Touch 'n Go
    { pattern: /\b(tng|touch\s*n\s*go|touchngo|touch\s*and\s*go)\b/i, method: "TNG" },
    
    // Bank Transfer variants
    { pattern: /\b(bank\s*transfer|bank\s*in|transfer|online\s*banking|fpx)\b/i, method: "BANK TRANSFER" },
    
    // Credit/Debit Card
    { pattern: /\b(card|credit\s*card|debit\s*card|stripe|visa|mastercard)\b/i, method: "CARD" },
    
    // E-wallet variants
    { pattern: /\b(grab\s*pay|grabtpay)\b/i, method: "GRABPAY" },
    { pattern: /\b(boost)\b/i, method: "BOOST" },
    { pattern: /\b(maya|paymaya)\b/i, method: "MAYA" },
    { pattern: /\b(gcash)\b/i, method: "GCASH" },
    
    // Generic cash
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
 * Enhanced repeat customer detection with multiple patterns
 */
function detectRepeatCustomer(text: string): boolean {
  if (!text) return false;
  
  const textLower = text.toLowerCase();
  
  // Multiple repeat customer indicators
  const repeatPatterns = [
    /\b\.?rpt\b/i,                    // .rpt or rpt
    /\brepeat\b/i,                    // repeat
    /\brepeating\b/i,                 // repeating
    /\breturn\s*customer\b/i,         // return customer
    /\bregular\s*customer\b/i,        // regular customer
    /\bexisting\s*customer\b/i,       // existing customer
    /\bold\s*customer\b/i,            // old customer
    /\b重复\b/,                       // Chinese: repeat
    /\b老客户\b/,                     // Chinese: old customer
    /\b回头客\b/,                     // Chinese: returning customer
  ];
  
  return repeatPatterns.some(pattern => pattern.test(textLower));
}

/**
 * Enhanced phone number extraction with better Malaysian/Singaporean patterns
 */
function extractPhoneNumber(text: string): string | null {
  if (!text) return null;
  
  // Enhanced phone number patterns
  const phonePatterns = [
    // Malaysian mobile with country code
    /\b(\+?60\s*1[0-9]\s*[0-9]{3,4}\s*[0-9]{4})\b/g,
    
    // Malaysian mobile without country code
    /\b(01[0-9]\s*[0-9]{3,4}\s*[0-9]{4})\b/g,
    
    // Malaysian landline with area code
    /\b(\+?60\s*[3-9]\s*[0-9]{3,4}\s*[0-9]{4})\b/g,
    /\b(0[3-9]\s*[0-9]{3,4}\s*[0-9]{4})\b/g,
    
    // Singapore mobile
    /\b(\+?65\s*[689][0-9]{3}\s*[0-9]{4})\b/g,
    /\b([689][0-9]{3}\s*[0-9]{4})\b/g,
    
    // Generic patterns with dashes
    /\b(\+?60\s*1[0-9]-[0-9]{3,4}-[0-9]{4})\b/g,
    /\b(01[0-9]-[0-9]{3,4}-[0-9]{4})\b/g,
    /\b(\+?65\s*[689][0-9]{3}-[0-9]{4})\b/g,
  ];
  
  for (const pattern of phonePatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      // Return the first valid phone number found
      return matches[0].replace(/\s+/g, ""); // Remove spaces
    }
  }
  
  return null;
}

/**
 * Add a phone number to the authorized list (for admin use)
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

/**
 * Remove a phone number from the authorized list (for admin use)
 */
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

    // Enhanced date detection with repeat customer handling
    if (
      line.toLowerCase().startsWith("date") &&
      (line.includes(":") || line.includes("："))
    ) {
      const dateContent = line.replace(/^date\s*[：:]\s*/i, "").trim();
      
      // Check for repeat indicators in the date line
      if (detectRepeatCustomer(dateContent)) {
        isRepeatCustomer = true;
        console.log(`   ✅ Repeat customer detected in date line`);
      }

      // Extract date part
      const cleanDateContent = dateContent.replace(/\s+(repeat|rpt).*$/i, "").trim();
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
    if (
      (line.toLowerCase().includes("total") &&
        (line.includes("：") || line.includes(":"))) ||
      line.toLowerCase().startsWith("total")
    ) {
      const totalMatch = line.match(/total[：:]\s*rm?\s*(\d+)/i);
      if (totalMatch) {
        totalPaid = parseInt(totalMatch[1]);
        console.log(`   ✅ Total (labeled): ${totalPaid}`);
      }
      continue;
    }

    // Enhanced name detection with payment method extraction
    if (
      line.toLowerCase().startsWith("name") &&
      (line.includes(":") || line.includes("："))
    ) {
      let nameContent = line.replace(/^name\s*[：:]\s*/i, "").trim();

      // Extract payment method from name if present
      const detectedPayment = detectPaymentMethod(nameContent);
      if (detectedPayment && !paymentMethod) {
        paymentMethod = detectedPayment;
        console.log(`   ✅ Payment method from name: ${paymentMethod}`);
      }

      // Remove payment indicators from name
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

    // Chinese format handling (enhanced)
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

    // Enhanced phone number detection
    if (!phoneNumber) {
      const extractedPhone = extractPhoneNumber(line);
      if (extractedPhone) {
        phoneNumber = normalizePhoneNumber(extractedPhone);
        console.log(`   ✅ Phone number detected: ${phoneNumber}`);
        continue;
      }
    }

    // Enhanced customer name detection with payment method extraction
    if (!customerName && line.match(/^[A-Za-z\s\(\)（）\-\.]+$/)) {
      let tempCustomerName = line.trim();

      // Extract payment method if present
      const detectedPayment = detectPaymentMethod(tempCustomerName);
      if (detectedPayment && !paymentMethod) {
        paymentMethod = detectedPayment;
        console.log(`   ✅ Payment method from name: ${paymentMethod}`);
      }

      // Remove payment indicators from customer name
      tempCustomerName = tempCustomerName
        .replace(/\s*[\(（]([^)）]*)[\)）]\s*$/g, "")
        .trim();

      customerName = tempCustomerName;
      console.log(`   ✅ Customer name: ${customerName}`);
      continue;
    }

    // Product code detection (unchanged)
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

    // Address lines handling (enhanced)
    if (
      !productCode &&
      line &&
      !isProductCode &&
      !line.includes("：") &&
      !line.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-](\d{2}|\d{4})/i) &&
      !detectPaymentMethod(line) &&
      !line.toLowerCase().includes("total")
    ) {
      address += (address ? ", " : "") + line;
      console.log(`   📍 Address line added: ${line}`);

      // Enhanced state detection
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

  // Use receiver name if available (Chinese format), otherwise use customer name
  const finalCustomerName =
    receiverName || customerName || context.customerName || "WhatsApp Customer";

  // Create enhanced remark with more details
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

  // Check for date pattern at the beginning
  const hasDateAtStart = /^\d{1,2}[\/\-]\d{1,2}[\/\-](\d{2}|\d{4})/.test(trimmed);

  // Check if it's a single line
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
 * Enhanced condensed order extraction
 */
function extractCondensedOrder(
  messageBody: string,
  context: MessageContext
): OrderData | null {
  console.log(`🔍 Extracting condensed order format...`);

  const trimmed = messageBody.trim();

  // Enhanced date extraction with repeat detection
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

  // Remove the date part and continue parsing
  let remaining = trimmed.substring(dateMatch[0].length).trim();

  // Enhanced payment and amount detection
  let paymentMethod = detectPaymentMethod(remaining) || "";
  let totalPaid = 0;

  const paymentMatch = remaining.match(/^(cod|bank|cash|transfer|tng)\s+rm(\d+)/i);
  if (paymentMatch) {
    if (!paymentMethod) {
      paymentMethod = detectPaymentMethod(paymentMatch[1]) || paymentMatch[1].toUpperCase();
    }
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

  // Enhanced customer name, phone, and address parsing
  const extractedPhone = extractPhoneNumber(remaining);
  if (!extractedPhone) {
    console.log(`❌ Could not extract phone number`);
    return null;
  }

  const phoneNumber = normalizePhoneNumber(extractedPhone);
  
  // Split around the phone number
  const phoneIndex = remaining.indexOf(extractedPhone);
  let customerName = remaining.substring(0, phoneIndex).trim();
  const addressString = remaining.substring(phoneIndex + extractedPhone.length).trim();

  // Enhanced customer name cleanup
  const detectedPaymentFromName = detectPaymentMethod(customerName);
  if (detectedPaymentFromName && !paymentMethod) {
    paymentMethod = detectedPaymentFromName;
    console.log(`   ✅ Payment method from name: ${paymentMethod}`);
  }

  // Remove payment indicators from customer name
  customerName = customerName
    .replace(/\s*[\(（]([^)）]*)[\)）]\s*$/g, "")
    .trim();

  console.log(`   ✅ Customer: ${customerName}`);
  console.log(`   ✅ Phone: ${phoneNumber}`);
  console.log(`   📍 Address: ${addressString}`);

  // Parse address components
  const addressComponents = parseAddress(addressString);

  // Create enhanced remark
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
 * Parse product code like "1w1f1s1w30ml" or "3f1w" into individual products
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

    // Handle 2-digit years
    if (year.length === 2) {
      const yearNum = parseInt(year);
      year = yearNum < 50 ? `20${year}` : `19${year}`;
    }

    return `${year}-${month}-${day}`;
  }
  return new Date().toISOString().split("T")[0];
}

/**
 * Enhanced address parsing with better Malaysian/Singaporean location detection
 */
function parseAddress(addressLine: string): {
  city: string;
  postcode: string;
  state: string;
} {
  let city = "";
  let postcode = "";
  let state = "";

  // Extract postcode (5-digit number for Malaysia, 6-digit for Singapore)
  const postcodeMatch = addressLine.match(/(\d{5,6})/);
  if (postcodeMatch) {
    postcode = postcodeMatch[1];
  }

  // Enhanced state detection for Malaysia and Singapore
  const locationStates = [
    // Malaysian states
    { name: "Selangor", variants: ["selangor", "sel", "shah alam", "petaling jaya", "pj", "subang", "klang"] },
    { name: "Kuala Lumpur", variants: ["kuala lumpur", "kl", "k.l", "k l"] },
    { name: "Penang", variants: ["penang", "pulau pinang", "pg", "georgetown", "george town"] },
    { name: "Johor", variants: ["johor", "jb", "johor bahru", "johor baru", "skudai", "masai"] },
    { name: "Perak", variants: ["perak", "ipoh", "taiping", "teluk intan"] },
    { name: "Kedah", variants: ["kedah", "alor setar", "sungai petani"] },
    { name: "Kelantan", variants: ["kelantan", "kota bharu", "kota bahru"] },
    { name: "Terengganu", variants: ["terengganu", "kuala terengganu"] },
    { name: "Pahang", variants: ["pahang", "kuantan", "temerloh"] },
    { name: "Negeri Sembilan", variants: ["negeri sembilan", "n9", "ns", "seremban", "port dickson"] },
    { name: "Melaka", variants: ["melaka", "malacca", "melaka tengah"] },
    { name: "Perlis", variants: ["perlis", "kangar"] },
    { name: "Sabah", variants: ["sabah", "kota kinabalu", "sandakan", "tawau"] },
    { name: "Sarawak", variants: ["sarawak", "kuching", "miri", "sibu"] },
    { name: "Putrajaya", variants: ["putrajaya", "cyberjaya"] },
    { name: "Labuan", variants: ["labuan"] },
    
    // Singapore (treat as single entity)
    { name: "Singapore", variants: ["singapore", "sg", "republik singapura"] },
  ];

  const addressLower = addressLine.toLowerCase();
  for (const stateInfo of locationStates) {
    for (const variant of stateInfo.variants) {
      if (addressLower.includes(variant)) {
        state = stateInfo.name;
        break;
      }
    }
    if (state) break;
  }

  // Enhanced city extraction
  const parts = addressLine.split(",").map((part) => part.trim());

  // Enhanced city prefixes for better recognition
  const cityPrefixes = [
    "taman", "bandar", "kampung", "kg", "pekan", "town",
    "shah alam", "petaling jaya", "pj", "subang jaya",
    "seri kembangan", "puchong", "cheras", "ampang",
    "damansara", "mont kiara", "ttdi", "bangsar",
    "mid valley", "kl sentral", "bukit bintang",
    "georgetown", "george town", "bayan lepas",
    "butterworth", "bukit mertajam", "nibong tebal",
  ];

  for (const part of parts) {
    const partLower = part.toLowerCase();

    // Check for city prefixes
    for (const prefix of cityPrefixes) {
      if (partLower.includes(prefix)) {
        city = part.replace(/\d{5,6}.*$/, "").trim();
        if (state) {
          city = city.replace(new RegExp(state, "gi"), "").trim();
        }
        return { city, postcode, state };
      }
    }
  }

  // Enhanced multi-word city detection
  const addressWords = addressLine.toLowerCase().split(/\s+/);
  for (let i = 0; i < addressWords.length - 1; i++) {
    const twoWordCombo = `${addressWords[i]} ${addressWords[i + 1]}`;
    const threeWordCombo = i < addressWords.length - 2 
      ? `${addressWords[i]} ${addressWords[i + 1]} ${addressWords[i + 2]}`
      : "";

    const multiWordCities = [
      "seri kembangan", "petaling jaya", "shah alam", "subang jaya",
      "bandar baru", "taman desa", "mont kiara", "bukit bintang",
      "kl sentral", "mid valley", "george town", "bayan lepas",
      "bukit mertajam", "nibong tebal", "johor bahru", "kota kinabalu",
    ];

    if (multiWordCities.includes(twoWordCombo)) {
      const originalWords = addressLine.split(/\s+/);
      city = `${originalWords[i]} ${originalWords[i + 1]}`;
      return { city, postcode, state };
    }

    if (threeWordCombo && multiWordCities.includes(threeWordCombo)) {
      const originalWords = addressLine.split(/\s+/);
      city = `${originalWords[i]} ${originalWords[i + 1]} ${originalWords[i + 2]}`;
      return { city, postcode, state };
    }
  }

  // Fallback: extract city from postcode vicinity
  for (let i = 0; i < parts.length; i++) {
    if (/\d{5,6}/.test(parts[i])) {
      if (i > 0) {
        city = parts[i - 1].trim();
      } else {
        const beforePostcode = parts[i].replace(/\d{5,6}.*$/, "").trim();
        if (beforePostcode) {
          city = beforePostcode;
        }
      }
      break;
    }
  }

  // Clean up city name
  city = city.replace(/\d{5,6}/, "").trim().replace(/\.$/, "");
  if (state) {
    city = city.replace(new RegExp(state, "gi"), "").trim();
  }

  return { city, postcode, state };
}

/**
 * Enhanced sheet data creation with better mapping
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

/**
 * Enhanced sheet row data creation with better field mapping
 */
export function createSheetRowData(
  orderData: OrderData,
  headers: string[]
): any[] {
  const rowData = new Array(headers.length).fill("");

  headers.forEach((header, index) => {
    const headerLower = header.toLowerCase().trim();

    switch (headerLower) {
      case "no":
        // Auto-numbered by sheets
        break;
      case "order date":
        rowData[index] = orderData.orderDate;
        break;
      case "fbname":
        // Could map to group name or leave empty
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
        // Determine currency based on phone number
        const phone = orderData.phoneNumber || "";
        if (phone.startsWith("65")) {
          rowData[index] = "SGD";
        } else {
          rowData[index] = "MYR";
        }
        break;
      case "status":
        rowData[index] = "Pending"; // Default status for new orders
        break;
      default:
        // Leave other columns empty
        break;
    }
  });

  return rowData;
}