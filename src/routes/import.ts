// src/routes/import.ts - Updated Import System for Historical Data
import express from "express";
import multer from "multer";
import Papa from "papaparse";
import { createOrderWithItems, supabase } from "../database/supabaseNormalized";

const importRouter = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for large historical files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "text/csv",
      "application/csv",
      "application/vnd.ms-excel",
    ];

    if (
      allowedTypes.includes(file.mimetype) ||
      file.originalname.endsWith(".csv")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed"));
    }
  },
});

// ============================================================================
// CSV FIELD MAPPING FOR YOUR DATA FORMAT
// ============================================================================

interface LegacyCSVRow {
  No: string;
  "Order Date": string;
  fbname: string;
  Name: string;
  "Payment method": string;
  wash: string;
  "Femlift 30ml": string;
  "Femlift 10ml": string;
  "Wash 30ml": string;
  Spray: string;
  remark: string;
  "package (rm)": string;
  "Postage (rm)": string;
  "Website/shopee charges (rm)": string;
  "TOTAL PAID (rm)": string;
  "shipment description": string;
  address: string;
  city: string;
  postcode: string;
  state: string;
  "phone number": string;
  "tracking number": string;
  "courires company": string;
  "new/repeat": string;
  "cash sale receipt": string;
  "Agent by / under": string;
  "sql system": string;
  currency: string;
  status: string;
}

// ============================================================================
// DATA TRANSFORMATION FUNCTIONS
// ============================================================================

function parseDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString();

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
  } catch (error) {
    console.warn(`Failed to parse date: ${dateStr}, using current date`);
    return new Date().toISOString();
  }
}

function parsePhoneNumber(phone: string): string {
  if (!phone) return "";

  // Clean up phone number
  let cleaned = phone.replace(/\s+/g, "").replace(/[^\d+]/g, "");

  // Add country code if missing
  if (cleaned.startsWith("01") || cleaned.startsWith("11")) {
    cleaned = "+60" + cleaned;
  } else if (cleaned.startsWith("60")) {
    cleaned = "+" + cleaned;
  } else if (!cleaned.startsWith("+")) {
    cleaned = "+60" + cleaned;
  }

  return cleaned;
}

function parseAddress(
  addressStr: string,
  city?: string,
  postcode?: string,
  state?: string
): {
  address_line_1: string;
  city?: string;
  postcode?: string;
  state?: string;
} {
  if (!addressStr) return { address_line_1: "" };

  // Clean up address
  let cleaned = addressStr.replace(/\t/g, "").replace(/\r/g, "").trim();

  // Try to extract city, postcode, state from address if not provided separately
  const addressParts = cleaned.split(",").map((part) => part.trim());

  return {
    address_line_1: cleaned,
    city: city?.trim() || extractFromAddress(addressParts, "city"),
    postcode: postcode?.trim() || extractFromAddress(addressParts, "postcode"),
    state: state?.trim() || extractFromAddress(addressParts, "state"),
  };
}

function extractFromAddress(
  parts: string[],
  type: "city" | "postcode" | "state"
): string | undefined {
  if (type === "postcode") {
    // Look for 5-digit postcodes
    for (const part of parts) {
      const match = part.match(/\b\d{5}\b/);
      if (match) return match[0];
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

function determineCustomerType(
  newRepeat: string,
  customerName: string,
  fbName: string
): "new" | "repeat" {
  if (
    newRepeat?.toLowerCase().includes("repeat") ||
    newRepeat?.toLowerCase().includes("r")
  ) {
    return "repeat";
  }
  if (
    newRepeat?.toLowerCase().includes("new") ||
    newRepeat?.toLowerCase().includes("n")
  ) {
    return "new";
  }
  // Default to new for historical data
  return "new";
}

function mapOrderStatus(status: string, paymentMethod: string): string {
  if (!status) {
    // Infer status from payment method for historical data
    if (
      paymentMethod?.toLowerCase().includes("shopee") ||
      paymentMethod?.toLowerCase().includes("lazada")
    ) {
      return "delivered"; // Marketplace orders are usually completed
    }
    return "completed"; // Default for historical data
  }

  const statusLower = status.toLowerCase();
  if (
    statusLower.includes("complete") ||
    statusLower.includes("done") ||
    statusLower.includes("deliver")
  ) {
    return "delivered";
  }
  if (statusLower.includes("ship")) return "shipped";
  if (statusLower.includes("process")) return "processing";
  if (statusLower.includes("confirm")) return "confirmed";
  if (statusLower.includes("pending")) return "pending";
  if (statusLower.includes("cancel")) return "cancelled";

  return "delivered"; // Default for historical data
}

function transformLegacyRow(row: LegacyCSVRow) {
  // Parse address
  const addressInfo = parseAddress(
    row.address,
    row.city,
    row.postcode,
    row.state
  );

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

  return {
    // Order data
    order: {
      order_date: parseDate(row["Order Date"]),
      customer_name: (row.Name || row.fbname || "Unknown Customer")
        .replace(/\r/g, "")
        .trim(),
      phone_number: parsePhoneNumber(row["phone number"]),
      fb_name: row.fbname?.trim() || undefined,
      payment_method: row["Payment method"]?.trim() || "Unknown",
      source: getSource(row["Payment method"]),
      agent_name: row["Agent by / under"]?.trim() || undefined,
      notes: row.remark?.trim() || undefined,
      address: addressInfo.address_line_1,
      city: addressInfo.city,
      postcode: addressInfo.postcode,
      state: addressInfo.state,
      tracking_number: row["tracking number"]?.trim() || undefined,
      courier_company: row["courires company"]?.trim() || undefined,
      status: mapOrderStatus(row.status, row["Payment method"]),
      currency: row.currency?.trim() || "MYR",
      cash_sale_receipt: row["cash sale receipt"]?.trim() || undefined,
      customer_type: determineCustomerType(
        row["new/repeat"],
        row.Name,
        row.fbname
      ),
      shipment_description: row["shipment description"]?.trim() || undefined,
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
    },
    // Original row number for tracking
    originalRowNo: row.No,
  };
}

function getSource(paymentMethod: string): string {
  if (!paymentMethod) return "manual_import";

  const method = paymentMethod.toLowerCase();
  if (method.includes("shopee")) return "shopee";
  if (method.includes("lazada")) return "lazada";
  if (method.includes("bank")) return "bank_transfer";
  if (method.includes("cash")) return "cash";
  if (method.includes("card")) return "card";

  return "manual_import";
}

// ============================================================================
// IMPORT ROUTES
// ============================================================================

// POST /api/import/historical-csv - Import historical CSV data
importRouter.post(
  "/historical-csv",
  upload.single("csvFile"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No CSV file uploaded",
        });
      }

      const {
        dryRun = "false",
        batchSize = "50",
        skipDuplicates = "true",
      } = req.body;

      console.log(
        `📊 Starting historical CSV import: ${req.file.originalname}`
      );
      console.log(
        `📋 Dry run: ${dryRun}, Batch size: ${batchSize}, Skip duplicates: ${skipDuplicates}`
      );

      // Parse CSV
      const csvContent = req.file.buffer.toString("utf8");
      const parsed = Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
        transform: (value) => value?.trim() || "",
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
          const row = parsed.data[i] as LegacyCSVRow;

          // Skip rows without essential data
          if (
            !row["Order Date"] ||
            !row["TOTAL PAID (rm)"] ||
            parseFloat(row["TOTAL PAID (rm)"]) <= 0
          ) {
            skippedRows++;
            continue;
          }

          const transformed = transformLegacyRow(row);
          transformedOrders.push(transformed);
        } catch (error) {
          errors.push({
            row: i + 1,
            error: error instanceof Error ? error.message : String(error),
            data: parsed.data[i],
          });
        }
      }

      console.log(
        `✅ Transformed ${transformedOrders.length} orders, ${skippedRows} skipped, ${errors.length} errors`
      );

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
          message:
            "Dry run completed. Use dryRun=false to actually import data.",
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
        console.log(
          `📦 Processing batch ${Math.floor(i / batchSizeNum) + 1}/${Math.ceil(
            transformedOrders.length / batchSizeNum
          )}`
        );

        for (const orderData of batch) {
          try {
            // Check for duplicates if enabled
            if (skipDuplicates === "true") {
              const existingOrder = await supabase
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
            await createSimpleOrderFromLegacy(orderData);
            successCount++;
          } catch (error) {
            errorCount++;
            importErrors.push({
              originalRowNo: orderData.originalRowNo,
              customerName: orderData.order.customer_name,
              error: error instanceof Error ? error.message : String(error),
            });

            if (importErrors.length >= 20) break; // Limit error collection
          }
        }
      }

      console.log(
        `✅ Import completed: ${successCount} success, ${duplicateCount} duplicates, ${errorCount} errors`
      );

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
    } catch (error) {
      console.error("❌ Historical import failed:", error);
      res.status(500).json({
        success: false,
        error: "Import failed",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// Helper function to create simple order from legacy data
async function createSimpleOrderFromLegacy(orderData: any) {
  const { order, amounts } = orderData;

  // Use the existing createSimpleOrder function but add the additional fields
  const createdOrder = await supabase
    .from("orders")
    .insert({
      order_number: `HIST-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`,
      customer_id: await getOrCreateCustomerId(order),
      shipping_address_id: order.address
        ? await getOrCreateAddressId(order)
        : undefined,
      order_date: order.order_date,
      total_amount: amounts.total_amount,
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

  if (createdOrder.error) throw createdOrder.error;
  return createdOrder.data;
}

async function getOrCreateCustomerId(orderData: any): Promise<number> {
  // Try to find existing customer
  let customer = await supabase
    .from("customers")
    .select("id")
    .eq("phone_number", orderData.phone_number)
    .maybeSingle();

  if (customer.data) {
    return customer.data.id;
  }

  // Create new customer
  const newCustomer = await supabase
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

  if (newCustomer.error) throw newCustomer.error;
  return newCustomer.data.id;
}

async function getOrCreateAddressId(
  orderData: any
): Promise<number | undefined> {
  if (!orderData.address) return undefined;

  const customerId = await getOrCreateCustomerId(orderData);

  // Create address
  const newAddress = await supabase
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

  if (newAddress.error) throw newAddress.error;
  return newAddress.data.id;
}

// GET /api/import/template - Download CSV template
importRouter.get("/template", (req, res) => {
  const template = `No,Order Date,fbname,Name,Payment method,wash,Femlift 30ml,Femlift 10ml,Wash 30ml,Spray,remark,package (rm),Postage (rm),Website/shopee charges (rm),TOTAL PAID (rm),shipment description,address,city,postcode,state,phone number,tracking number,courires company,new/repeat,cash sale receipt,Agent by / under,sql system,currency,status
1,1/8/25,facebook_name,Customer Name,Bank Transfer,1,1,0,0,1,Customer notes,150,10,5,165,Product description,123 Main St,Kuala Lumpur,50000,Selangor,+60123456789,TRK123456,J&T Express,new,CSR001,Agent Name,,MYR,completed`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=lunaa_import_template.csv"
  );
  res.send(template);
});

export default importRouter;
