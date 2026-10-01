// src/whatsappOrderBot.ts
import {google} from 'googleapis';
import dotenv from 'dotenv';
import path from 'path';
import {
    extraGridRowsNeeded,
    quoteSheetName,
    sheetRowWriteRange,
} from './utils/sheetMapper';
import {resolveSheetNames} from './utils/monthlySheet';

dotenv.config({path: path.resolve(__dirname, '../.env.local')});

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface OrderData {
    email?: string;
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

export interface ProductOrder {
    name: string;
    quantity: number;
    type?: string;
}

export interface MessageContext {
    customerPhone: string;
    customerName?: string;
    groupName?: string;
    messageId?: string;
    timestamp?: string;
}

interface AgentInfo {
    phoneNumber: string;
    name: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const AUTHORIZED_AGENTS: AgentInfo[] = [
    {
        phoneNumber: '601126470411',
        name: 'Sales - 0411',
    },
    {
        phoneNumber: '60174941361',
        name: 'Sales - 1361',
    },
    {
        phoneNumber: '60164525013',
        name: 'Sales - 5013',
    },
    {
        phoneNumber: '60127909921',
        name: 'Sales - 9921',
    },
    {
        phoneNumber: '60164561361',
        name: 'Sales - 61361',
    },
    {
        phoneNumber: '601158699901',
        name: 'Sales - 9901',
    },
    {
        phoneNumber: '60174589098',
        name: 'Sales - 9098'
    }
];

const PHONE_TO_AGENT = new Map<string, AgentInfo>();
const AUTHORIZED_PHONE_NUMBERS: string[] = [];

// Initialize Google Sheets API
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON!);
const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({version: 'v4', auth});

// ============================================================================
// PHONE NUMBER UTILITIES
// ============================================================================

export class PhoneNumberUtil {
    static normalize(phoneNumber: string): string {
        if (!phoneNumber) return '';
        const digits = phoneNumber.replace(/\D/g, '');

        // Handle Singapore numbers first (+65)
        if (digits.startsWith('65')) {
            return digits;
        } else if (digits.length === 8 && /^[3689]/.test(digits)) {
            return '65' + digits;
        }

        // Handle Malaysian numbers (+60)
        if (digits.startsWith('60')) {
            return digits;
        } else if (digits.startsWith('0')) {
            return '60' + digits.substring(1);
        } else if (
            digits.length >= 9 &&
            digits.length <= 11 &&
            /^[13-9]/.test(digits)
        ) {
            if (digits.startsWith('6') && digits.length === 8) {
                return '65' + digits;
            }
            return '60' + digits;
        }

        return digits;
    }

    static extract(text: string): string | null {
        if (!text) return null;

        console.log(`🔍 Extracting phone from: "${text}"`);

        const patterns = [
            // Singapore patterns first (to avoid false Malaysian matches)
            /\b(\+?65\s*[689][0-9]{3}\s*[0-9]{4})\b/g,
            /\b([689][0-9]{3}\s*[0-9]{4})\b/g,
            /\b(\+?65\s*[689][0-9]{3}-[0-9]{4})\b/g,

            // Malaysian patterns
            /\b(\+?60\s*1[0-9]\s*[0-9]{3,4}\s*[0-9]{4})\b/g,
            /\b(01[0-9]\s*[0-9]{3,4}\s*[0-9]{4})\b/g,
            /\b(\+?60\s*[3-9]\s*[0-9]{3,4}\s*[0-9]{4})\b/g,
            /\b(0[3-9]\s*[0-9]{3,4}\s*[0-9]{4})\b/g,
            /\b(\+?60\s*1[0-9]-[0-9]{3,4}-[0-9]{4})\b/g,
            /\b(01[0-9]-[0-9]{3,4}-[0-9]{4})\b/g,

            // More flexible patterns for formats like 014-9999333
            /\b(01[0-9]-[0-9]{7})\b/g,
            /\b(01[0-9]-[0-9]{4}-[0-9]{3})\b/g,
            /\b(016-[0-9]{7})\b/g,
            /\b(016-[0-9]{4}-[0-9]{3})\b/g,
        ];

        for (let i = 0; i < patterns.length; i++) {
            const pattern = patterns[i];
            const matches = text.match(pattern);
            if (matches && matches.length > 0) {
                const result = matches[0].replace(/\s+/g, '');
                console.log(`   ✅ Pattern ${i + 1} matched: "${result}"`);
                return result;
            }
        }

        console.log(`   ❌ No phone pattern matched`);
        return null;
    }

    static isAuthorized(phoneNumber: string): boolean {
        if (!phoneNumber) return false;
        const normalized = this.normalize(phoneNumber);

        return AUTHORIZED_PHONE_NUMBERS.some((authNumber) => {
            const normalizedAuth = this.normalize(authNumber);
            if (normalized === normalizedAuth) return true;

            // Compare without country codes
            if (normalized.startsWith('60') && normalizedAuth.startsWith('60')) {
                return normalized.substring(2) === normalizedAuth.substring(2);
            }
            if (normalized.startsWith('65') && normalizedAuth.startsWith('65')) {
                return normalized.substring(2) === normalizedAuth.substring(2);
            }
            return false;
        });
    }

    // ✅ NEW: Get agent info from phone number
    static getAgentInfo(phoneNumber: string): AgentInfo | null {
        if (!phoneNumber) return null;
        const normalized = this.normalize(phoneNumber);
        return PHONE_TO_AGENT.get(normalized) || null;
    }

    // ✅ NEW: Get agent name for display
    static getAgentName(phoneNumber: string): string {
        const agent = this.getAgentInfo(phoneNumber);
        return agent ? agent.name : `Agent ${phoneNumber}`;
    }
}

// Initialize maps
AUTHORIZED_AGENTS.forEach((agent) => {
    const normalizedPhone = PhoneNumberUtil.normalize(agent.phoneNumber);
    PHONE_TO_AGENT.set(normalizedPhone, agent);
    AUTHORIZED_PHONE_NUMBERS.push(normalizedPhone);
});

// ============================================================================
// CONTENT EXTRACTORS
// ============================================================================

class ContentExtractor {
    static extractTotal(text: string): number {
        if (!text) return 0;

        const patterns = [
            /total\s*[：:]\s*(?:rm)?\s*(\d+)/i,
            /total\s+(?:rm\s*)?(\d+)/i,
            /total.*?(\d+)/i,
            /^rm\s*(\d+)$/i,
            /(\d{2,4})\s*(ringgit|dollar|myr|sgd)/i,
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) return parseInt(match[1]);
        }

        // Standalone amount check
        if (text.match(/^\d{2,4}$/)) {
            const amount = parseInt(text);
            if (amount >= 20 && amount <= 9999) return amount;
        }

        return 0;
    }

    static detectPaymentMethod(text: string): string | null {
        if (!text) return null;

        const methods = [
            {pattern: /\b(cod|cash\s*on\s*delivery)\b/i, method: 'COD'},
            {pattern: /\b(tng|touch\s*n\s*go|touchngo)\b/i, method: 'TNG'},
            {
                pattern: /\b(bank\s*transfer|transfer|fpx)\b/i,
                method: 'BANK TRANSFER',
            },
            {pattern: /\b(card|credit\s*card|debit\s*card)\b/i, method: 'CARD'},
            {pattern: /\b(grab\s*pay|grabpay)\b/i, method: 'GRABPAY'},
            {pattern: /\b(boost)\b/i, method: 'BOOST'},
            {pattern: /\b(maya|paymaya)\b/i, method: 'MAYA'},
            {pattern: /\b(gcash)\b/i, method: 'GCASH'},
            {pattern: /\b(cash|tunai)\b/i, method: 'CASH'},
            {pattern: /\b(atome)\b/i, method: 'ATOME'},
        ];

        const textLower = text.toLowerCase().trim();
        for (const {pattern, method} of methods) {
            if (pattern.test(textLower)) return method;
        }
        return null;
    }

    static detectRepeatCustomer(text: string): boolean {
        if (!text) return false;
        const patterns = [
            /\b\.?rpt\b/i,
            /\brepeat\b/i,
            /\breturn\s*customer\b/i,
            /\bregular\s*customer\b/i,
            /\b重复\b/,
            /\b老客户\b/,
        ];
        return patterns.some((pattern) => pattern.test(text.toLowerCase()));
    }

    static parseProductCode(productCode: string): ProductOrder[] {
        if (!productCode) return [];

        const products: ProductOrder[] = [];
        let remaining = productCode.replace(/\s/g, '').toLowerCase();

        while (remaining.length > 0) {
            const match = remaining.match(/^(\d+)([wfs])(30ml|10ml)?/i);
            if (!match) break;

            const [full, qty, letter, size] = match;
            const quantity = parseInt(qty);

            switch (letter) {
                case 'w':
                    products.push({
                        name: size === '30ml' ? 'wash_30ml' : 'wash',
                        quantity,
                        type: size || '',
                    });
                    break;
                case 'f':
                    products.push({
                        name: size === '10ml' ? 'femlift_10ml' : 'femlift_30ml',
                        quantity,
                        type: size || '30ml',
                    });
                    break;
                case 's':
                    products.push({name: 'spray', quantity, type: ''});
                    break;
                case 'b':
                case 'B':
                    products.push({name: 'blossom', quantity, type: ''});
            }

            remaining = remaining.substring(full.length);
        }

        return products;
    }

    static formatDate(dateStr: string): string {
        const parts = dateStr.split(/[\/\-]/);
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            let year = parts[2];

            if (year.length === 2) {
                const yearNum = parseInt(year);
                year = yearNum < 50 ? `20${year}` : `19${year}`;
            }

            return `${year}-${month}-${day}`;
        }
        return new Date().toISOString().split('T')[0];
    }
}

// ============================================================================
// ADDRESS PARSER
// ============================================================================

class AddressParser {
    private static readonly STATES = [
        {
            name: 'Selangor',
            variants: ['selangor', 'sel'],
            postcodes: [40000, 48999],
        },
        {
            name: 'Kuala Lumpur',
            variants: ['kuala lumpur', 'kl'],
            postcodes: [50000, 60999],
        },
        {
            name: 'Penang',
            variants: ['penang', 'pulau pinang'],
            postcodes: [10000, 14999],
        },
        {name: 'Johor', variants: ['johor', 'jb'], postcodes: [79000, 86999]},
        {name: 'Perak', variants: ['perak'], postcodes: [30000, 36999]},
        {name: 'Kedah', variants: ['kedah'], postcodes: [5000, 9999]},
        {name: 'Kelantan', variants: ['kelantan'], postcodes: [15000, 18999]},
        {name: 'Terengganu', variants: ['terengganu'], postcodes: [20000, 24999]},
        {name: 'Pahang', variants: ['pahang'], postcodes: [25000, 29999]},
        {
            name: 'Negeri Sembilan',
            variants: ['negeri sembilan', 'n9'],
            postcodes: [70000, 73999],
        },
        {
            name: 'Melaka',
            variants: ['melaka', 'malacca'],
            postcodes: [75000, 78999],
        },
        {name: 'Perlis', variants: ['perlis'], postcodes: [1000, 2999]},
        {name: 'Sabah', variants: ['sabah'], postcodes: [87000, 91999]},
        {name: 'Sarawak', variants: ['sarawak'], postcodes: [93000, 98999]},
        {name: 'Putrajaya', variants: ['putrajaya'], postcodes: [62000, 62999]},
        {name: 'Labuan', variants: ['labuan'], postcodes: [87000, 87999]},
        {name: 'Singapore', variants: ['singapore', 'sg'], postcodes: []},
    ];

    static parse(addressLine: string) {
        const address = addressLine.trim();
        const addressLower = address.toLowerCase();

        // Extract postcode
        let postcode = '';
        const malaysianPostcode = address.match(/\b\d{5}\b/);
        const singaporePostcode = address.match(/\b\d{6}\b/);

        if (malaysianPostcode) postcode = malaysianPostcode[0];
        else if (singaporePostcode) postcode = singaporePostcode[0];

        // Determine state
        let state = '';

        // First try by name variants
        for (const stateInfo of this.STATES) {
            if (
                stateInfo.variants.some((variant) => addressLower.includes(variant))
            ) {
                state = stateInfo.name;
                break;
            }
        }

        // If no state found and we have postcode, try by postcode range
        if (!state && postcode) {
            const postcodeNum = parseInt(postcode);

            if (postcode.length === 6) {
                state = 'Singapore';
            } else if (postcode.length === 5) {
                for (const stateInfo of this.STATES) {
                    const [min, max] = stateInfo.postcodes;
                    if (min && max && postcodeNum >= min && postcodeNum <= max) {
                        state = stateInfo.name;
                        break;
                    }
                }
            }
        }

        return {
            address,
            city: '', // Not extracting city as requested
            postcode,
            state,
        };
    }
}

// ============================================================================
// ORDER EXTRACTOR (Main Logic)
// ============================================================================

class OrderExtractor {
    static extract(
        messageBody: string,
        context: MessageContext
    ): OrderData | null {
        // Validate authorization
        if (!PhoneNumberUtil.isAuthorized(context.customerPhone)) {
            console.log(`❌ Unauthorized phone: ${context.customerPhone}`);
            return null;
        }

        // Determine format and extract
        if (this.isCondensedFormat(messageBody)) {
            return this.extractCondensed(messageBody, context);
        } else {
            return this.extractMultiLine(messageBody, context);
        }
    }

    private static isCondensedFormat(messageBody: string): boolean {
        const trimmed = messageBody.trim();
        const lines = trimmed.split('\n').filter((line) => line.trim());

        const hasDateAtStart = /^\d{1,2}[\/\-]\d{1,2}[\/\-](\d{2}|\d{4})/.test(
            trimmed
        );
        const hasProductAtEnd = /\s+\d+[wfs](\d+ml)?(\d+[wfs](\d+ml)?)*\s*$/i.test(
            trimmed
        );
        const isCondensedCandidate =
            lines.length === 1 ||
            (lines.length === 2 &&
                /^\d+[wfs](\d+ml)?(\d+[wfs](\d+ml)?)*$/i.test(lines[1]));

        return hasDateAtStart && hasProductAtEnd && isCondensedCandidate;
    }

    private static extractCondensed(
        messageBody: string,
        context: MessageContext
    ): OrderData | null {
        const trimmed = messageBody.trim();

        // Extract date
        const dateMatch = trimmed.match(
            /^(\d{1,2}[\/\-]\d{1,2}[\/\-](?:\d{2}|\d{4}))/
        );
        if (!dateMatch) return null;

        const orderDate = ContentExtractor.formatDate(dateMatch[1]);
        let remaining = trimmed.substring(dateMatch[0].length).trim();

        // Extract product code from end
        const productMatch = remaining.match(
            /\s+(\d+[wfs](\d+ml)?(\d+[wfs](\d+ml)?)*)\s*$/i
        );
        if (!productMatch) return null;

        const productCode = productMatch[1];
        remaining = remaining
            .substring(0, remaining.length - productMatch[0].length)
            .trim();

        // Extract payment and amount
        let paymentMethod = ContentExtractor.detectPaymentMethod(remaining) || '';
        let totalPaid = 0;

        const paymentAmountMatch = remaining.match(
            /^(cod|bank|cash|transfer|tng|grabpay|boost)\s+rm\s*(\d+)/i
        );
        if (paymentAmountMatch) {
            paymentMethod = paymentMethod || paymentAmountMatch[1].toUpperCase();
            totalPaid = parseInt(paymentAmountMatch[2]);
            remaining = remaining.substring(paymentAmountMatch[0].length).trim();
        } else {
            const amountMatch = remaining.match(/^(?:rm\s*)?(\d{2,4})\s+/i);
            if (amountMatch) {
                totalPaid = parseInt(amountMatch[1]);
                remaining = remaining.substring(amountMatch[0].length).trim();
            }
        }

        // Extract customer email
        let email = '';
        const emailMatch = remaining.match(
            /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
        );
        if (emailMatch) {
            email = emailMatch[0];
            remaining = remaining.substring(0, emailMatch.index).trim();
        }

        // Extract phone and customer info
        const extractedPhone = PhoneNumberUtil.extract(remaining);
        if (!extractedPhone) return null;

        const phoneNumber = PhoneNumberUtil.normalize(extractedPhone);
        const phoneIndex = remaining.indexOf(extractedPhone);
        const customerName = remaining.substring(0, phoneIndex).trim();
        const addressString = remaining
            .substring(phoneIndex + extractedPhone.length)
            .trim();

        const addressComponents = AddressParser.parse(addressString);
        const isRepeat = ContentExtractor.detectRepeatCustomer(messageBody);

        return this.buildOrderData({
            email,
            orderDate,
            customerName,
            phoneNumber,
            totalPaid,
            productCode,
            address: addressString,
            addressComponents,
            paymentMethod,
            isRepeat,
            context,
        });
    }

    private static extractMultiLine(
        messageBody: string,
        context: MessageContext
    ): OrderData | null {
        const lines = messageBody
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        if (lines.length < 2) return null;

        console.log(
            `🔍 Processing ${lines.length} lines for multi-line extraction:`
        );
        lines.forEach((line, i) => console.log(`   ${i + 1}: "${line}"`));

        // Initialize extraction data
        const data = {
            email: '',
            orderDate: '',
            totalPaid: 0,
            customerName: '',
            receiverName: '',
            phoneNumber: '',
            address: '',
            productCode: '',
            paymentMethod: '',
            isRepeatCustomer: false,
        };

        // Global detection
        data.isRepeatCustomer = ContentExtractor.detectRepeatCustomer(messageBody);
        data.paymentMethod =
            ContentExtractor.detectPaymentMethod(messageBody) || '';

        // Find product code first
        for (const line of lines) {
            if (
                /^(\d+[wfs](\d+ml)?)+$/i.test(line.trim()) &&
                !PhoneNumberUtil.extract(line)
            ) {
                data.productCode = line.trim();
                console.log(`📦 Found product code: ${data.productCode}`);
                break;
            }
        }

        // Process each line
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            console.log(`🔍 Processing line ${i + 1}: "${line}"`);

            if (data.productCode && line.trim() === data.productCode) {
                console.log(`   ⏭️ Skipping product code line`);
                continue;
            }

            // Date detection
            if (line.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-](\d{2}|\d{4})$/)) {
                data.orderDate = ContentExtractor.formatDate(line);
                console.log(`   📅 Found date: ${data.orderDate}`);
                continue;
            }

            // Labeled fields
            if (this.processLabeledField(line, data)) {
                console.log(`   ✅ Processed labeled field`);
                continue;
            }

            // Chinese format
            if (this.processChineseField(line, data)) {
                console.log(`   ✅ Processed Chinese field`);
                continue;
            }

            // Phone number detection
            if (!data.phoneNumber) {
                const phone = PhoneNumberUtil.extract(line);
                if (phone) {
                    data.phoneNumber = PhoneNumberUtil.normalize(phone);
                    console.log(`   📞 Found phone number: ${data.phoneNumber}`);
                    continue;
                }
            }

            // Customer name detection
            if (
                !data.customerName &&
                line.match(/^[A-Za-z\s\(\)（）\-\.]+$/) &&
                !PhoneNumberUtil.extract(line)
            ) {
                data.customerName = line
                    .trim()
                    .replace(/\s*[\(（]([^)）]*)[\)）]\s*$/g, '');
                console.log(`   👤 Found customer name: ${data.customerName}`);
                continue;
            }

            // Address line detection
            if (this.isAddressLine(line, data)) {
                data.address += (data.address ? ', ' : '') + line;
                console.log(`   📍 Added address line: ${line}`);
                console.log(`   📍 Full address now: ${data.address}`);
                continue;
            }

            // Total amount detection
            if (!data.totalPaid) {
                const total = ContentExtractor.extractTotal(line);
                if (total > 0) {
                    data.totalPaid = total;
                    console.log(`   💰 Found total: ${data.totalPaid}`);
                    continue;
                }
            }

            console.log(`   ⚠️ Line not processed: "${line}"`);
        }

        console.log(`\n📊 Final extraction results:`);
        console.log(`   Order Date: ${data.orderDate}`);
        console.log(`   Customer Name: ${data.customerName}`);
        console.log(`   Phone Number: ${data.phoneNumber}`);
        console.log(`   Address: ${data.address}`);
        console.log(`   Product Code: ${data.productCode}`);
        console.log(`   Total Paid: ${data.totalPaid}`);
        console.log(`   Payment Method: ${data.paymentMethod}`);

        // Validation and final processing
        if (!data.phoneNumber) {
            console.log('❌ No customer phone number found');
            return null;
        }

        const addressComponents = AddressParser.parse(data.address);
        const finalCustomerName =
            data.receiverName || data.customerName || 'WhatsApp Customer';

        return this.buildOrderData({
            email: data.email || '',
            orderDate: data.orderDate || new Date().toISOString().split('T')[0],
            customerName: finalCustomerName,
            phoneNumber: data.phoneNumber,
            totalPaid: data.totalPaid,
            productCode: data.productCode,
            address: data.address.trim(),
            addressComponents,
            paymentMethod: data.paymentMethod,
            isRepeat: data.isRepeatCustomer,
            context,
        });
    }

    private static processLabeledField(line: string, data: any): boolean {
        const lowerLine = line.toLowerCase();

        // Check for labeled fields with colons
        if (
            (lowerLine.startsWith('name') ||
                lowerLine.startsWith('contact') ||
                lowerLine.startsWith('address') ||
                lowerLine.startsWith('payment') ||
                lowerLine.startsWith('total')) &&
            (line.includes(':') || line.includes('：'))
        ) {
            const content = line.replace(/^[^：:]*[：:]\s*/i, '').trim();

            if (lowerLine.startsWith('name')) {
                data.customerName = content.replace(
                    /\s*[\(（]([^)）]*)[\)）]\s*$/g,
                    ''
                );
                return true;
            }
            if (lowerLine.startsWith('contact')) {
                const phone = PhoneNumberUtil.extract(content);
                if (phone) {
                    data.phoneNumber = PhoneNumberUtil.normalize(phone);
                    console.log(
                        `📞 Found phone number: ${data.phoneNumber} from contact line: "${line}"`
                    );
                }
                return true;
            }
            if (lowerLine.startsWith('address')) {
                data.address = content;
                return true;
            }
            if (lowerLine.startsWith('payment')) {
                const payment = ContentExtractor.detectPaymentMethod(content);
                if (payment) data.paymentMethod = payment;
                return true;
            }
            if (lowerLine.startsWith('total')) {
                const total = ContentExtractor.extractTotal(content);
                if (total > 0) {
                    data.totalPaid = total;
                    console.log(
                        `💰 Found total: ${data.totalPaid} from total line: "${line}"`
                    );
                }
                return true;
            }
        }
        return false;
    }

    private static processChineseField(line: string, data: any): boolean {
        if (line.includes('汇款人名字：')) {
            data.customerName = line.replace('汇款人名字：', '').trim();
            return true;
        }
        if (line.includes('收件人名字：')) {
            data.receiverName = line.replace('收件人名字：', '').trim();
            return true;
        }
        if (line.includes('电话号码：')) {
            const phone = PhoneNumberUtil.extract(
                line.replace('电话号码：', '').trim()
            );
            if (phone) data.phoneNumber = PhoneNumberUtil.normalize(phone);
            return true;
        }
        if (line.includes('地址：')) {
            data.address = line.replace('地址：', '').trim();
            return true;
        }
        return false;
    }

    private static isAddressLine(line: string, data: any): boolean {
        return Boolean(
            line &&
            !line.includes('：') &&
            !line.includes(':') &&
            !line.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-](\d{2}|\d{4})/i) &&
            !ContentExtractor.detectPaymentMethod(line) &&
            !line.toLowerCase().includes('total') &&
            !line.match(/^(?:rm\s*)?\d{2,4}$/i) &&
            !PhoneNumberUtil.extract(line) &&
            !line.match(/^[A-Za-z\s\(\)（）\-\.]+$/)
        );
    }

    private static buildOrderData(params: {
        email: string;
        orderDate: string;
        customerName: string;
        phoneNumber: string;
        totalPaid: number;
        productCode: string;
        address: string;
        addressComponents: any;
        paymentMethod: string;
        isRepeat: boolean;
        context: MessageContext;
    }): OrderData {
        const baseRemark = `Order from WhatsApp${
            params.context.groupName ? ` (Group: ${params.context.groupName})` : ''
        }${params.isRepeat ? ' (Repeat Customer)' : ' (New Customer)'}`;

        return {
            orderDate: params.orderDate,
            customerName: params.customerName,
            phoneNumber: params.phoneNumber,
            products: ContentExtractor.parseProductCode(params.productCode),
            address: params.address,
            city: params.addressComponents.city,
            postcode: params.addressComponents.postcode,
            state: params.addressComponents.state,
            totalPaid: params.totalPaid,
            productCode: params.productCode,
            remark: params.productCode
                ? `${baseRemark} - ${params.productCode}`
                : baseRemark,
            paymentMethod: params.paymentMethod || undefined,
            messageId: params.context.messageId,
            isRepeatCustomer: params.isRepeat,
            groupName: params.context.groupName,
        };
    }
}

// ============================================================================
// GOOGLE SHEETS INTEGRATION
// ============================================================================

class SheetsIntegration {
    static async appendOrder(
        orderData: OrderData
    ): Promise<{ success: boolean; rowIndex?: number; error?: string }> {
        try {
            const spreadsheetId = process.env.GOOGLE_SHEET_ID!;
            const sheetNames = resolveSheetNames(
                JSON.parse(process.env.SHEET_NAMES || '["Test"]'),
                orderData.orderDate
            );

            const results = [];

            for (const sheetName of sheetNames) {
                try {
                    const response = await sheets.spreadsheets.values.get({
                        spreadsheetId,
                        range: `${quoteSheetName(sheetName)}!A:CZ`,
                    });

                    const rows = response.data.values || [];
                    if (rows.length === 0) continue;

                    const headers = rows[0];
                    const rowData = this.createRowData(orderData, headers);
                    const nextRow = rows.length + 1;
                    const meta = await sheets.spreadsheets.get({
                        spreadsheetId,
                        fields:
                            'sheets(properties(sheetId,title,gridProperties(rowCount)))',
                    });
                    const sheetMeta = meta.data.sheets?.find(
                        (item) => item.properties?.title === sheetName
                    );
                    const extraRows = extraGridRowsNeeded(
                        sheetMeta?.properties?.gridProperties?.rowCount ?? 0,
                        nextRow
                    );
                    if (sheetMeta?.properties?.sheetId != null && extraRows > 0) {
                        await sheets.spreadsheets.batchUpdate({
                            spreadsheetId,
                            requestBody: {
                                requests: [
                                    {
                                        appendDimension: {
                                            sheetId: sheetMeta.properties.sheetId,
                                            dimension: 'ROWS',
                                            length: extraRows,
                                        },
                                    },
                                ],
                            },
                        });
                    }

                    await sheets.spreadsheets.values.update({
                        spreadsheetId,
                        range: sheetRowWriteRange(sheetName, rows),
                        valueInputOption: 'RAW',
                        requestBody: {values: [rowData]},
                    });

                    results.push({sheetName, success: true, rowIndex: rows.length + 1});
                } catch (error) {
                    results.push({
                        sheetName,
                        success: false,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }

            const successful = results.filter((r) => r.success);
            return {
                success: successful.length > 0,
                rowIndex: successful[0]?.rowIndex,
                error:
                    successful.length < results.length
                        ? `Success: ${successful.length}/${results.length} sheets`
                        : undefined,
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    private static createRowData(orderData: OrderData, headers: string[]): any[] {
        const rowData = new Array(headers.length).fill('');

        headers.forEach((header, index) => {
            const key = header.toLowerCase().trim();

            switch (key) {
                case 'order date':
                    rowData[index] = orderData.orderDate;
                    break;
                case 'fbname':
                    rowData[index] = orderData.groupName || '';
                    break;
                case 'name':
                    rowData[index] = orderData.customerName;
                    break;
                case 'payment method':
                    rowData[index] = orderData.paymentMethod || '';
                    break;
                case 'total paid (rm)':
                    rowData[index] = orderData.totalPaid || '';
                    break;
                case 'shipment description':
                    rowData[index] = orderData.productCode || '';
                    break;
                case 'address':
                    rowData[index] = orderData.address || '';
                    break;
                case 'city':
                    rowData[index] = orderData.city || '';
                    break;
                case 'postcode':
                    rowData[index] = orderData.postcode || '';
                    break;
                case 'state':
                    rowData[index] = orderData.state || '';
                    break;
                case 'phone number':
                    rowData[index] = orderData.phoneNumber || '';
                    break;
                case 'email':
                    rowData[index] = orderData.email || '';
                    break;
                case 'new/repeat':
                    rowData[index] = orderData.isRepeatCustomer ? 'repeat' : 'new';
                    break;
                case 'agent by / under':
                    rowData[index] = 'WhatsApp Bot';
                    break;
                case 'currency':
                    rowData[index] = orderData.phoneNumber?.startsWith('65')
                        ? 'SGD'
                        : 'MYR';
                    break;
                case 'status':
                    rowData[index] = 'Pending';
                    break;
                case 'remark':
                case 'remarks':
                    rowData[index] = orderData.remark || '';
                    break;

                // Product quantities
                case 'wash':
                    rowData[index] = this.getProductQuantity(orderData.products, 'wash');
                    break;
                case 'femlift 30ml':
                    rowData[index] = this.getProductQuantity(
                        orderData.products,
                        'femlift_30ml'
                    );
                    break;
                case 'femlift 10ml':
                    rowData[index] = this.getProductQuantity(
                        orderData.products,
                        'femlift_10ml'
                    );
                    break;
                case 'wash 30ml':
                    rowData[index] = this.getProductQuantity(
                        orderData.products,
                        'wash_30ml'
                    );
                    break;
                case 'spray':
                    rowData[index] = this.getProductQuantity(orderData.products, 'spray');
                    break;
                case 'blossom':
                    rowData[index] = this.getProductQuantity(
                        orderData.products,
                        'blossom'
                    );
                    break;
            }
        });

        return rowData;
    }

    private static getProductQuantity(
        products: ProductOrder[],
        productName: string
    ): number | string {
        const qty = products
            .filter((p) => p.name === productName)
            .reduce((sum, p) => sum + p.quantity, 0);
        return qty > 0 ? qty : '';
    }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function extractOrderFromMessage(
    messageBody: string,
    context: MessageContext
): OrderData | null {
    return OrderExtractor.extract(messageBody, context);
}

export async function appendOrderToSheet(orderData: OrderData) {
    return SheetsIntegration.appendOrder(orderData);
}

export function createSheetRowData(
    orderData: OrderData,
    headers: string[]
): any[] {
    return SheetsIntegration['createRowData'](orderData, headers);
}

// Admin functions
export function addAuthorizedPhoneNumber(phoneNumber: string): boolean {
    const normalized = PhoneNumberUtil.normalize(phoneNumber);
    if (!PhoneNumberUtil.isAuthorized(normalized)) {
        AUTHORIZED_PHONE_NUMBERS.push(normalized);
        console.log(`✅ Added ${normalized} to authorized numbers`);
        return true;
    }
    console.log(`⚠️ ${normalized} is already authorized`);
    return false;
}

export function removeAuthorizedPhoneNumber(phoneNumber: string): boolean {
    const normalized = PhoneNumberUtil.normalize(phoneNumber);
    const index = AUTHORIZED_PHONE_NUMBERS.findIndex(
        (num) => PhoneNumberUtil.normalize(num) === normalized
    );

    if (index !== -1) {
        AUTHORIZED_PHONE_NUMBERS.splice(index, 1);
        console.log(`✅ Removed ${normalized} from authorized numbers`);
        return true;
    }
    console.log(`⚠️ ${normalized} was not found in authorized numbers`);
    return false;
}

export function getAuthorizedPhoneNumbers(): string[] {
    return [...AUTHORIZED_PHONE_NUMBERS];
}

export function getUnauthorizedMessage(): string {
    return 'Sorry, your phone number is not authorized to place orders through this bot. Please contact the administrator if you believe this is an error.';
}
