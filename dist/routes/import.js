"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/import.ts - Updated Import System for Historical Data
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const papaparse_1 = __importDefault(require("papaparse"));
const supabaseNormalized_1 = require("../database/supabaseNormalized");
const importRouter = express_1.default.Router();
// Configure multer for file uploads
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit for large historical files
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            "text/csv",
            "application/csv",
            "application/vnd.ms-excel",
        ];
        if (allowedTypes.includes(file.mimetype) ||
            file.originalname.endsWith(".csv")) {
            cb(null, true);
        }
        else {
            cb(new Error("Only CSV files are allowed"));
        }
    },
});
// ============================================================================
// DATA TRANSFORMATION FUNCTIONS
// ============================================================================
function parseDate(dateStr) {
    if (!dateStr)
        return new Date().toISOString();
    try {
        // Handle formats like "1/8/25" (day/month/year)
        const parts = dateStr.split("/");
        if (parts.length === 3) {
            const day = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1; // JS months are 0-based
            let year = parseInt(parts[2]);
            // Handle 2-digit years
            if (year < 100) {
                year += year > 50 ? 1900 : 2000;
            }
            return new Date(year, month, day).toISOString();
        }
        // Try parsing as-is
        return new Date(dateStr).toISOString();
    }
    catch (error) {
        console.warn(`Failed to parse date: ${dateStr}, using current date`);
        return new Date().toISOString();
    }
}
function parsePhoneNumber(phone) {
    if (!phone)
        return "";
    // Clean up phone number
    let cleaned = phone.replace(/\s+/g, "").replace(/[^\d+]/g, "");
    // Add country code if missing
    if (cleaned.startsWith("01") || cleaned.startsWith("11")) {
        cleaned = "+60" + cleaned;
    }
    else if (cleaned.startsWith("60")) {
        cleaned = "+" + cleaned;
    }
    else if (!cleaned.startsWith("+")) {
        cleaned = "+60" + cleaned;
    }
    return cleaned;
}
function parseAddress(addressStr, city, postcode, state) {
    if (!addressStr)
        return { address_line_1: "" };
    // Clean up address
    let cleaned = addressStr.replace(/\t/g, "").replace(/\r/g, "").trim();
    // Try to extract city, postcode, state from address if not provided separately
    const addressParts = cleaned.split(",").map((part) => part.trim());
    return {
        address_line_1: cleaned,
        city: (city === null || city === void 0 ? void 0 : city.trim()) || extractFromAddress(addressParts, "city"),
        postcode: (postcode === null || postcode === void 0 ? void 0 : postcode.trim()) || extractFromAddress(addressParts, "postcode"),
        state: (state === null || state === void 0 ? void 0 : state.trim()) || extractFromAddress(addressParts, "state"),
    };
}
function extractFromAddress(parts, type) {
    if (type === "postcode") {
        // Look for 5-digit postcodes
        for (const part of parts) {
            const match = part.match(/\b\d{5}\b/);
            if (match)
                return match[0];
        }
    }
    if (type === "state") {
        // Common Malaysian states
        const states = [
            "Johor",
            "Kedah",
            "Kelantan",
            "Melaka",
            "Negeri Sembilan",
            "Pahang",
            "Penang",
            "Perak",
            "Perlis",
            "Sabah",
            "Sarawak",
            "Selangor",
            "Terengganu",
        ];
        for (const part of parts) {
            for (const state of states) {
                if (part.toLowerCase().includes(state.toLowerCase())) {
                    return state;
                }
            }
        }
    }
    return undefined;
}
function determineCustomerType(newRepeat, customerName, fbName) {
    if ((newRepeat === null || newRepeat === void 0 ? void 0 : newRepeat.toLowerCase().includes("repeat")) ||
        (newRepeat === null || newRepeat === void 0 ? void 0 : newRepeat.toLowerCase().includes("r"))) {
        return "repeat";
    }
    if ((newRepeat === null || newRepeat === void 0 ? void 0 : newRepeat.toLowerCase().includes("new")) ||
        (newRepeat === null || newRepeat === void 0 ? void 0 : newRepeat.toLowerCase().includes("n"))) {
        return "new";
    }
    // Default to new for historical data
    return "new";
}
function mapOrderStatus(status, paymentMethod) {
    if (!status) {
        // Infer status from payment method for historical data
        if ((paymentMethod === null || paymentMethod === void 0 ? void 0 : paymentMethod.toLowerCase().includes("shopee")) ||
            (paymentMethod === null || paymentMethod === void 0 ? void 0 : paymentMethod.toLowerCase().includes("lazada"))) {
            return "delivered"; // Marketplace orders are usually completed
        }
        return "completed"; // Default for historical data
    }
    const statusLower = status.toLowerCase();
    if (statusLower.includes("complete") ||
        statusLower.includes("done") ||
        statusLower.includes("deliver")) {
        return "delivered";
    }
    if (statusLower.includes("ship"))
        return "shipped";
    if (statusLower.includes("process"))
        return "processing";
    if (statusLower.includes("confirm"))
        return "confirmed";
    if (statusLower.includes("pending"))
        return "pending";
    if (statusLower.includes("cancel"))
        return "cancelled";
    return "delivered"; // Default for historical data
}
function transformLegacyRow(row) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    // Parse address
    const addressInfo = parseAddress(row.address, row.city, row.postcode, row.state);
    // Parse amounts
    const totalPaid = parseFloat(row["TOTAL PAID (rm)"]) || 0;
    const packagePrice = parseFloat(row["package (rm)"]) || 0;
    const postage = parseFloat(row["Postage (rm)"]) || 0;
    const websiteCharges = parseFloat(row["Website/shopee charges (rm)"]) || 0;
    // Product quantities
    const washQty = parseInt(row.wash) || 0;
    const femlift30Qty = parseInt(row["Femlift 30ml"]) || 0;
    const femlift10Qty = parseInt(row["Femlift 10ml"]) || 0;
    const wash30Qty = parseInt(row["Wash 30ml"]) || 0;
    const sprayQty = parseInt(row.Spray) || 0;
    const blossomQty = parseInt(row.Blossom) || 0;
    return {
        // Order data
        order: {
            order_date: parseDate(row["Order Date"]),
            customer_name: (row.Name || "Unknown Customer")
                .replace(/\r/g, "")
                .trim(),
            phone_number: parsePhoneNumber(row["phone number"]),
            fb_name: ((_a = row.fbname) === null || _a === void 0 ? void 0 : _a.trim()) || undefined,
            payment_method: ((_b = row["Payment method"]) === null || _b === void 0 ? void 0 : _b.trim()) || "Unknown",
            source: getSource(row["Payment method"]),
            agent_name: ((_c = row["Agent by / under"]) === null || _c === void 0 ? void 0 : _c.trim()) || undefined,
            notes: ((_d = row.remark) === null || _d === void 0 ? void 0 : _d.trim()) || undefined,
            address: addressInfo.address_line_1,
            city: addressInfo.city,
            postcode: addressInfo.postcode,
            state: addressInfo.state,
            tracking_number: ((_e = row["tracking number"]) === null || _e === void 0 ? void 0 : _e.trim()) || undefined,
            courier_company: ((_f = row["courires company"]) === null || _f === void 0 ? void 0 : _f.trim()) || undefined,
            status: mapOrderStatus(row.status, row["Payment method"]),
            currency: ((_g = row.currency) === null || _g === void 0 ? void 0 : _g.trim()) || "MYR",
            cash_sale_receipt: ((_h = row["cash sale receipt"]) === null || _h === void 0 ? void 0 : _h.trim()) || undefined,
            customer_type: determineCustomerType(row["new/repeat"], row.Name, row.fbname),
            shipment_description: ((_j = row["shipment description"]) === null || _j === void 0 ? void 0 : _j.trim()) || undefined,
        },
        // Financial data
        amounts: {
            total_amount: totalPaid,
            package_price: packagePrice,
            postage: postage,
            website_charges: websiteCharges,
            subtotal: totalPaid - postage - websiteCharges,
        },
        // Product quantities (for future order items)
        products: {
            wash_120ml: washQty,
            femlift_30ml: femlift30Qty,
            femlift_10ml: femlift10Qty,
            wash_30ml: wash30Qty,
            spray: sprayQty,
            blossom: blossomQty,
        },
        // Original row number for tracking
        originalRowNo: row.No,
    };
}
function getSource(paymentMethod) {
    if (!paymentMethod)
        return "manual_import";
    const method = paymentMethod.toLowerCase();
    if (method.includes("shopee"))
        return "shopee";
    if (method.includes("lazada"))
        return "lazada";
    if (method.includes("bank"))
        return "bank_transfer";
    if (method.includes("cash"))
        return "cash";
    if (method.includes("card"))
        return "card";
    return "manual_import";
}
// ============================================================================
// IMPORT ROUTES
// ============================================================================
// POST /api/import/historical-csv - Import historical CSV data
importRouter.post("/historical-csv", upload.single("csvFile"), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: "No CSV file uploaded",
            });
        }
        const { dryRun = "false", batchSize = "50", skipDuplicates = "true", } = req.body;
        console.log(`📊 Starting historical CSV import: ${req.file.originalname}`);
        console.log(`📋 Dry run: ${dryRun}, Batch size: ${batchSize}, Skip duplicates: ${skipDuplicates}`);
        // Parse CSV
        const csvContent = req.file.buffer.toString("utf8");
        const parsed = papaparse_1.default.parse(csvContent, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => header.trim(),
            transform: (value) => (value === null || value === void 0 ? void 0 : value.trim()) || "",
        });
        if (parsed.errors.length > 0) {
            console.error("CSV parsing errors:", parsed.errors);
            return res.status(400).json({
                success: false,
                error: "CSV parsing failed",
                details: parsed.errors,
            });
        }
        console.log(`📝 Parsed ${parsed.data.length} rows from CSV`);
        // Transform data
        const transformedOrders = [];
        const errors = [];
        let skippedRows = 0;
        for (let i = 0; i < parsed.data.length; i++) {
            try {
                const row = parsed.data[i];
                // Skip rows without essential data
                if (!row["Order Date"] ||
                    !row["TOTAL PAID (rm)"] ||
                    parseFloat(row["TOTAL PAID (rm)"]) <= 0) {
                    skippedRows++;
                    continue;
                }
                const transformed = transformLegacyRow(row);
                transformedOrders.push(transformed);
            }
            catch (error) {
                errors.push({
                    row: i + 1,
                    error: error instanceof Error ? error.message : String(error),
                    data: parsed.data[i],
                });
            }
        }
        console.log(`✅ Transformed ${transformedOrders.length} orders, ${skippedRows} skipped, ${errors.length} errors`);
        // If dry run, return preview
        if (dryRun === "true") {
            return res.json({
                success: true,
                dryRun: true,
                summary: {
                    totalRows: parsed.data.length,
                    validOrders: transformedOrders.length,
                    skippedRows,
                    errors: errors.length,
                },
                preview: transformedOrders.slice(0, 5), // First 5 for preview
                errors: errors.slice(0, 10), // First 10 errors
                message: "Dry run completed. Use dryRun=false to actually import data.",
            });
        }
        // Actual import
        let successCount = 0;
        let duplicateCount = 0;
        let errorCount = 0;
        const importErrors = [];
        // Process in batches
        const batchSizeNum = parseInt(batchSize);
        for (let i = 0; i < transformedOrders.length; i += batchSizeNum) {
            const batch = transformedOrders.slice(i, i + batchSizeNum);
            console.log(`📦 Processing batch ${Math.floor(i / batchSizeNum) + 1}/${Math.ceil(transformedOrders.length / batchSizeNum)}`);
            for (const orderData of batch) {
                try {
                    // Check for duplicates if enabled
                    if (skipDuplicates === "true") {
                        const existingOrder = yield supabaseNormalized_1.supabase
                            .from("orders")
                            .select("id")
                            .eq("total_amount", orderData.amounts.total_amount)
                            .ilike("customers.customer_name", orderData.order.customer_name)
                            .single();
                        if (existingOrder.data) {
                            duplicateCount++;
                            continue;
                        }
                    }
                    // Create order using normalized schema
                    yield createSimpleOrderFromLegacy(orderData);
                    successCount++;
                }
                catch (error) {
                    errorCount++;
                    importErrors.push({
                        originalRowNo: orderData.originalRowNo,
                        customerName: orderData.order.customer_name,
                        error: error instanceof Error ? error.message : String(error),
                    });
                    if (importErrors.length >= 20)
                        break; // Limit error collection
                }
            }
        }
        console.log(`✅ Import completed: ${successCount} success, ${duplicateCount} duplicates, ${errorCount} errors`);
        res.json({
            success: true,
            summary: {
                totalProcessed: transformedOrders.length,
                successfulImports: successCount,
                duplicatesSkipped: duplicateCount,
                errors: errorCount,
                transformationErrors: errors.length,
                skippedRows,
            },
            errors: importErrors,
            message: `Successfully imported ${successCount} orders from ${req.file.originalname}`,
        });
    }
    catch (error) {
        console.error("❌ Historical import failed:", error);
        res.status(500).json({
            success: false,
            error: "Import failed",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
// Helper function to create simple order from legacy data
function createSimpleOrderFromLegacy(orderData) {
    return __awaiter(this, void 0, void 0, function* () {
        const { order, amounts } = orderData;
        // Use the existing createSimpleOrder function but add the additional fields
        const createdOrder = yield supabaseNormalized_1.supabase
            .from("orders")
            .insert({
            order_number: `HIST-${Date.now()}-${Math.random()
                .toString(36)
                .substr(2, 9)}`,
            customer_id: yield getOrCreateCustomerId(order),
            shipping_address_id: order.address
                ? yield getOrCreateAddressId(order)
                : undefined,
            order_date: order.order_date,
            total_amount: amounts.total_amount,
            phone_number: order.phone_number,
            subtotal: amounts.subtotal,
            postage: amounts.postage,
            website_charges: amounts.website_charges,
            payment_method: order.payment_method,
            payment_status: "paid", // Historical orders are assumed paid
            source: order.source,
            agent_name: order.agent_name,
            notes: order.notes,
            status: order.status,
            currency: order.currency,
            tracking_number: order.tracking_number,
            courier_company: order.courier_company,
            cash_sale_receipt: order.cash_sale_receipt,
            shipment_description: order.shipment_description,
            created_at: order.order_date, // Use order date as created date for historical data
            updated_at: new Date().toISOString(),
        })
            .select()
            .single();
        if (createdOrder.error)
            throw createdOrder.error;
        return createdOrder.data;
    });
}
function getOrCreateCustomerId(orderData) {
    return __awaiter(this, void 0, void 0, function* () {
        // Try to find existing customer
        let customer = yield supabaseNormalized_1.supabase
            .from("customers")
            .select("id")
            .eq("phone_number", orderData.phone_number)
            .maybeSingle();
        if (customer.data) {
            return customer.data.id;
        }
        // Create new customer
        const newCustomer = yield supabaseNormalized_1.supabase
            .from("customers")
            .insert({
            customer_name: orderData.customer_name,
            phone_number: orderData.phone_number,
            fb_name: orderData.fb_name,
            customer_type: orderData.customer_type,
            created_at: orderData.order_date,
            updated_at: new Date().toISOString(),
        })
            .select("id")
            .single();
        if (newCustomer.error)
            throw newCustomer.error;
        return newCustomer.data.id;
    });
}
function getOrCreateAddressId(orderData) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!orderData.address)
            return undefined;
        const customerId = yield getOrCreateCustomerId(orderData);
        // Create address
        const newAddress = yield supabaseNormalized_1.supabase
            .from("addresses")
            .insert({
            customer_id: customerId,
            address_line_1: orderData.address,
            city: orderData.city,
            postcode: orderData.postcode,
            state: orderData.state,
            address_type: "shipping",
            is_default: true,
            created_at: orderData.order_date,
            updated_at: new Date().toISOString(),
        })
            .select("id")
            .single();
        if (newAddress.error)
            throw newAddress.error;
        return newAddress.data.id;
    });
}
// GET /api/import/template - Download CSV template
importRouter.get("/template", (req, res) => {
    const template = `No,Order Date,fbname,Name,Payment method,wash,Femlift 30ml,Femlift 10ml,Wash 30ml,Spray,Blossom,remark,package (rm),Postage (rm),Website/shopee charges (rm),TOTAL PAID (rm),shipment description,address,city,postcode,state,phone number,tracking number,courires company,new/repeat,cash sale receipt,Agent by / under,sql system,currency,status
1,1/8/25,facebook_name,Customer Name,Bank Transfer,1,1,0,0,1,Customer notes,150,10,5,165,Product description,123 Main St,Kuala Lumpur,50000,Selangor,+60123456789,TRK123456,J&T Express,new,CSR001,Agent Name,,MYR,completed`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=lunaa_import_template.csv");
    res.send(template);
});
// POST /api/import/validate - Corrected validation for LUNAA CSV
importRouter.post("/validate", upload.single('file'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("Validation started");
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: "No file uploaded"
            });
        }
        const fileContent = req.file.buffer.toString('utf-8');
        console.log("File size:", fileContent.length, "characters");
        const parseResult = papaparse_1.default.parse(fileContent, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header, index) => {
                const cleanHeader = header.trim();
                return cleanHeader || `column_${index}`;
            },
            transform: (value) => {
                return value ? value.toString().trim() : '';
            }
        });
        console.log("Parse errors:", parseResult.errors);
        console.log("Parsed data length:", parseResult.data.length);
        const data = parseResult.data;
        if (!data || data.length === 0) {
            return res.status(400).json({
                success: false,
                error: "No data found in CSV",
                details: "File appears to be empty or invalid"
            });
        }
        const headers = Object.keys(data[0] || {});
        console.log("Detected headers:", headers);
        // CORRECTED: Exact field mapping for LUNAA CSV
        const fieldMapping = {};
        const mappingConfig = [
            { dbField: 'customer_name', possibleNames: ['Name'] }, // FIXED: Use 'Name' not 'fbname'
            { dbField: 'phone_number', possibleNames: ['phone number'] },
            { dbField: 'fb_name', possibleNames: ['fbname'] }, // Facebook name separate
            { dbField: 'order_date', possibleNames: ['Order Date'] },
            { dbField: 'payment_method', possibleNames: ['Payment method'] },
            { dbField: 'total_amount', possibleNames: ['TOTAL PAID (rm)'] },
            { dbField: 'subtotal', possibleNames: ['package (rm)'] },
            { dbField: 'postage', possibleNames: ['Postage (rm)'] },
            { dbField: 'website_charges', possibleNames: ['Website/shopee charges (rm)'] },
            { dbField: 'address', possibleNames: ['address'] },
            { dbField: 'city', possibleNames: ['city'] },
            { dbField: 'postcode', possibleNames: ['postcode'] },
            { dbField: 'state', possibleNames: ['state'] },
            { dbField: 'shipment_description', possibleNames: ['shipment description'] }, // ADDED
            { dbField: 'tracking_number', possibleNames: ['tracking number'] },
            { dbField: 'courier_company', possibleNames: ['courires company'] },
            { dbField: 'customer_type', possibleNames: ['new/repeat'] }, // FIXED
            { dbField: 'currency', possibleNames: ['currency'] },
            { dbField: 'status', possibleNames: ['status'] },
            { dbField: 'notes', possibleNames: ['remark'] },
            { dbField: 'agent_name', possibleNames: ['Agent by / under'] }, // ADDED
            { dbField: 'cash_sale_receipt', possibleNames: ['cash sale receipt'] } // ADDED
        ];
        // Exact matching first
        mappingConfig.forEach(config => {
            const foundHeader = headers.find(header => config.possibleNames.includes(header));
            if (foundHeader) {
                fieldMapping[config.dbField] = foundHeader;
            }
        });
        console.log("Field mapping:", fieldMapping);
        // Only require total_amount - be more lenient
        const essentialFields = ['total_amount'];
        const missingEssential = essentialFields.filter(field => !fieldMapping[field]);
        if (missingEssential.length > 0) {
            return res.status(400).json({
                success: false,
                error: "Missing essential columns",
                details: `Could not find columns for: ${missingEssential.join(', ')}`
            });
        }
        // Generate preview with proper data handling
        const preview = data.slice(0, 10).map((row, index) => {
            const transformed = {};
            Object.entries(fieldMapping).forEach(([dbField, csvHeader]) => {
                let value = row[csvHeader];
                switch (dbField) {
                    case 'customer_name':
                        // Use Name column as primary customer name
                        transformed[dbField] = value || row[fieldMapping['fb_name']] || `Customer_${index + 1}`;
                        break;
                    case 'customer_type':
                        // Handle new/repeat mapping
                        const typeValue = value === null || value === void 0 ? void 0 : value.toString().toLowerCase().trim();
                        transformed[dbField] = typeValue === 'repeat' || typeValue === 'r' ? 'repeat' : 'new';
                        break;
                    case 'total_amount':
                    case 'subtotal':
                    case 'postage':
                    case 'website_charges':
                        transformed[dbField] = parseFloat(value) || 0;
                        break;
                    case 'phone_number':
                        // Handle phone number formatting
                        if (value) {
                            let phone = value.toString().trim();
                            if (phone && !phone.startsWith('+')) {
                                phone = '+60' + phone.replace(/^0+/, ''); // Remove leading zeros and add +60
                            }
                            transformed[dbField] = phone;
                        }
                        else {
                            transformed[dbField] = `+60${Math.floor(Math.random() * 100000000)}`; // Generate if missing
                        }
                        break;
                    case 'postcode':
                        transformed[dbField] = value ? Math.floor(parseFloat(value)).toString() : '';
                        break;
                    default:
                        transformed[dbField] = value || '';
                }
            });
            return {
                rowNumber: index + 2, // +2 because row 1 is headers
                original: row,
                transformed
            };
        });
        // Count valid rows - only check for positive total_amount
        const validRows = data.filter(row => {
            const amountField = fieldMapping['total_amount'];
            return row[amountField] && parseFloat(row[amountField]) > 0;
        }).length;
        const warnings = [];
        if (validRows < data.length) {
            warnings.push(`${data.length - validRows} rows will be skipped due to missing or zero total_amount`);
        }
        const validation = {
            isValid: validRows > 0,
            errors: validRows === 0 ? ['No valid rows found with positive total_amount'] : [],
            warnings,
            preview,
            validRows,
            totalRows: data.length
        };
        console.log(`Validation completed: ${validRows} valid rows out of ${data.length} total rows`);
        const responseData = {
            success: true,
            data: {
                validation,
                summary: {
                    totalRows: data.length,
                    validRows,
                    mappedFields: Object.keys(fieldMapping).length
                },
                detectedHeaders: headers,
                fieldMapping
            }
        };
        res.json(responseData);
    }
    catch (error) {
        console.error("Validation error:", error);
        res.status(500).json({
            success: false,
            error: "Validation failed",
            details: error instanceof Error ? error.message : String(error)
        });
    }
}));
// POST /api/import/execute - Corrected execution for LUNAA CSV
importRouter.post("/execute", upload.single('file'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        console.log("Import execution started");
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: "No file uploaded"
            });
        }
        const batchSize = parseInt(req.body.batchSize) || 50;
        const fileContent = req.file.buffer.toString('utf-8');
        const parseResult = papaparse_1.default.parse(fileContent, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header, index) => {
                const cleanHeader = header.trim();
                return cleanHeader || `column_${index}`;
            },
            transform: (value) => {
                return value ? value.toString().trim() : '';
            }
        });
        const data = parseResult.data;
        console.log(`Processing ${data.length} rows`);
        let successfulInserts = 0;
        let failedInserts = 0;
        const errors = [];
        const headers = Object.keys(data[0] || {});
        // Same field mapping as validation
        const fieldMapping = {};
        const mappingConfig = [
            { dbField: 'customer_name', possibleNames: ['Name'] },
            { dbField: 'phone_number', possibleNames: ['phone number'] },
            { dbField: 'fb_name', possibleNames: ['fbname'] },
            { dbField: 'order_date', possibleNames: ['Order Date'] },
            { dbField: 'payment_method', possibleNames: ['Payment method'] },
            { dbField: 'total_amount', possibleNames: ['TOTAL PAID (rm)'] },
            { dbField: 'subtotal', possibleNames: ['package (rm)'] },
            { dbField: 'postage', possibleNames: ['Postage (rm)'] },
            { dbField: 'website_charges', possibleNames: ['Website/shopee charges (rm)'] },
            { dbField: 'address', possibleNames: ['address'] },
            { dbField: 'city', possibleNames: ['city'] },
            { dbField: 'postcode', possibleNames: ['postcode'] },
            { dbField: 'state', possibleNames: ['state'] },
            { dbField: 'shipment_description', possibleNames: ['shipment description'] },
            { dbField: 'tracking_number', possibleNames: ['tracking number'] },
            { dbField: 'courier_company', possibleNames: ['courires company'] },
            { dbField: 'customer_type', possibleNames: ['new/repeat'] },
            { dbField: 'currency', possibleNames: ['currency'] },
            { dbField: 'status', possibleNames: ['status'] },
            { dbField: 'notes', possibleNames: ['remark'] },
            { dbField: 'agent_name', possibleNames: ['Agent by / under'] },
            { dbField: 'cash_sale_receipt', possibleNames: ['cash sale receipt'] }
        ];
        mappingConfig.forEach(config => {
            const foundHeader = headers.find(header => config.possibleNames.includes(header));
            if (foundHeader) {
                fieldMapping[config.dbField] = foundHeader;
            }
        });
        // Process each row
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const rowNumber = i + 2; // +2 for header row and 0-based index
            try {
                // Get total amount first
                const totalAmount = parseFloat(row[fieldMapping['total_amount']]) || 0;
                if (totalAmount <= 0) {
                    console.log(`Skipping row ${rowNumber}: invalid total_amount (${totalAmount})`);
                    continue;
                }
                // Get customer name from Name column (FIXED - same logic as validation)
                const customerName = ((_a = row[fieldMapping['customer_name']]) === null || _a === void 0 ? void 0 : _a.trim()) ||
                    `Customer_${rowNumber}`; // Don't use fbname as fallback
                const fbName = ((_b = row[fieldMapping['fb_name']]) === null || _b === void 0 ? void 0 : _b.trim()) || '';
                // Handle phone number
                let phoneNumber = (_c = row[fieldMapping['phone_number']]) === null || _c === void 0 ? void 0 : _c.toString().trim();
                phoneNumber = phoneNumber
                    ? (phoneNumber.startsWith('+')
                        ? phoneNumber
                        : '+60' + phoneNumber.replace(/^0+/, ''))
                    : null;
                // Handle customer type
                const customerTypeRaw = (_d = row[fieldMapping['customer_type']]) === null || _d === void 0 ? void 0 : _d.toString().toLowerCase().trim();
                const customerType = customerTypeRaw === 'repeat' || customerTypeRaw === 'r' ? 'repeat' : 'new';
                // Parse date
                let orderDate = new Date().toISOString();
                if (row[fieldMapping['order_date']]) {
                    try {
                        const dateParts = row[fieldMapping['order_date']].split('/');
                        if (dateParts.length === 3) {
                            const day = parseInt(dateParts[0]);
                            const month = parseInt(dateParts[1]) - 1;
                            let year = parseInt(dateParts[2]);
                            if (year < 100) {
                                year += year > 50 ? 1900 : 2000;
                            }
                            orderDate = new Date(year, month, day).toISOString();
                        }
                    }
                    catch (dateError) {
                        console.log(`Date parsing error for row ${rowNumber}, using current date`);
                    }
                }
                console.log(`Processing row ${rowNumber}: ${customerName}, ${phoneNumber}, ${customerType}, amount: ${totalAmount}`);
                const orderData = {
                    customer_name: customerName,
                    phone_number: phoneNumber,
                    fb_name: row[fieldMapping['fb_name']] || '',
                    total_amount: totalAmount,
                    subtotal: parseFloat(row[fieldMapping['subtotal']]) || totalAmount,
                    postage: parseFloat(row[fieldMapping['postage']]) || 0,
                    website_charges: parseFloat(row[fieldMapping['website_charges']]) || 0,
                    payment_method: row[fieldMapping['payment_method']] || 'cash',
                    source: 'csv_import',
                    agent_name: row[fieldMapping['agent_name']] || 'CSV Import',
                    notes: row[fieldMapping['notes']] || 'Imported from LUNAA CSV',
                    address_line_1: row[fieldMapping['address']] || '',
                    city: row[fieldMapping['city']] || '',
                    postcode: row[fieldMapping['postcode']] ? Math.floor(parseFloat(row[fieldMapping['postcode']])).toString() : '',
                    state: row[fieldMapping['state']] || '',
                    shipment_description: row[fieldMapping['shipment_description']] || '',
                    tracking_number: row[fieldMapping['tracking_number']] || '',
                    courier_company: row[fieldMapping['courier_company']] || '',
                    customer_type: customerType,
                    currency: row[fieldMapping['currency']] || 'MYR',
                    status: row[fieldMapping['status']] || 'completed'
                };
                yield (0, supabaseNormalized_1.createSimpleOrder)(orderData);
                successfulInserts++;
                console.log(`✅ Successfully imported row ${rowNumber}: ${customerName}`);
            }
            catch (error) {
                failedInserts++;
                const errorMessage = error instanceof Error ? error.message : String(error);
                errors.push({
                    row: rowNumber,
                    customer: row[fieldMapping['customer_name']] || 'Unknown',
                    error: errorMessage
                });
                console.error(`❌ Failed to import row ${rowNumber}:`, errorMessage);
            }
        }
        console.log(`Import completed: ${successfulInserts} success, ${failedInserts} failed`);
        res.json({
            success: true,
            data: {
                success: true,
                totalProcessed: data.length,
                successfulInserts,
                failedInserts,
                duplicatesSkipped: 0,
                errors: errors.slice(0, 20)
            }
        });
    }
    catch (error) {
        console.error("Import execution error:", error);
        res.status(500).json({
            success: false,
            error: "Import failed",
            details: error instanceof Error ? error.message : String(error)
        });
    }
}));
exports.default = importRouter;
