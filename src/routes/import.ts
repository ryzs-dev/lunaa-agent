// src/routes/import.ts - New backend routes for file imports
import express from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { bulkInsertOrders, supabase } from "../database/supabaseOrders";
import { Order } from "../types/database";

const importRouter = express.Router();

// Configure multer for file uploads (memory storage for processing)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept CSV and Excel files
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/csv'
    ];
    
    if (allowedTypes.includes(file.mimetype) || 
        file.originalname.endsWith('.csv') || 
        file.originalname.endsWith('.xlsx') || 
        file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  }
});

// Interface for import validation results
interface ImportValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  preview: any[];
  totalRows: number;
  validRows: number;
}

// Interface for import results
interface ImportResult {
  success: boolean;
  totalProcessed: number;
  successfulInserts: number;
  failedInserts: number;
  errors: any[];
  duplicatesSkipped?: number;
}

// Field mapping configuration
const FIELD_MAPPINGS: Record<string, string[]> = {
  customer_name: ['customer_name', 'name', 'customer', 'client_name', 'buyer_name', 'fb_name'],
  phone_number: ['phone_number', 'phone', 'mobile', 'contact', 'tel', 'telephone'],
  total_paid: ['total_paid', 'total', 'amount', 'price', 'payment_amount'],
  order_date: ['order_date', 'date', 'order_datetime', 'created_date', 'purchase_date'],
  currency: ['currency', 'curr', 'money_type'],
  payment_method: ['payment_method', 'payment_type', 'payment', 'method'],
  tracking_number: ['tracking_number', 'tracking', 'track_no', 'tracking_no', 'awb'],
  courier_company: ['courier_company', 'courier', 'shipping_company', 'delivery_company'],
  status: ['status', 'order_status', 'state'],
  new_or_repeat: ['new_or_repeat', 'customer_type', 'type', 'customerType'],
  agent_name: ['agent_name', 'agent', 'sales_agent', 'representative'],
  remark: ['remark', 'remarks', 'comment', 'comments', 'note', 'notes'],
  // Product quantities
  wash_qty: ['wash_qty', 'wash120ml', 'wash_120ml', 'wash'],
  femlift_30ml_qty: ['femlift_30ml_qty', 'femlift30ml', 'femlift_30ml'],
  femlift_10ml_qty: ['femlift_10ml_qty', 'femlift10ml', 'femlift_10ml'],
  wash_30ml_qty: ['wash_30ml_qty', 'wash30ml', 'wash_30ml'],
  spray_qty: ['spray_qty', 'spray', 'spray_quantity'],
  package_price: ['package_price', 'packageAmount', 'package_amount'],
  postage: ['postage', 'shipping_cost', 'delivery_fee'],
  cash_sale_receipt: ['cash_sale_receipt', 'cashSaleReceipt', 'receipt_no']
};

// Function to auto-map CSV headers to database fields
function mapHeaders(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  
  // Normalize headers for comparison
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_'));
  
  // Try to map each database field to a CSV column
  Object.entries(FIELD_MAPPINGS).forEach(([dbField, possibleNames]) => {
    for (const possibleName of possibleNames) {
      const normalizedPossible = possibleName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const index = normalizedHeaders.findIndex(h => 
        h === normalizedPossible || 
        h.includes(normalizedPossible) || 
        normalizedPossible.includes(h)
      );
      
      if (index !== -1) {
        mapping[dbField] = index;
        break;
      }
    }
  });
  
  return mapping;
}

// Function to parse CSV data
function parseCSV(buffer: Buffer): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const csvText = buffer.toString('utf8');
    
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      transformHeader: (header: string) => header.trim(),
      complete: (results) => {
        if (results.errors.length > 0) {
          console.warn('CSV parsing warnings:', results.errors);
        }
        resolve(results.data);
      },
      error: (error: { message: any; }) => {
        reject(new Error(`CSV parsing failed: ${error.message}`));
      }
    });
  });
}

// Function to parse Excel data
function parseExcel(buffer: Buffer): any[] {
  try {
    const workbook = XLSX.read(buffer, { 
      type: 'buffer',
      cellDates: true,
      cellNF: true,
      cellText: false
    });
    
    // Use the first sheet
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error('No sheets found in Excel file');
    }
    
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      raw: false,
      dateNF: 'yyyy-mm-dd'
    });
    
    if (jsonData.length < 2) {
      throw new Error('Excel file must contain at least a header row and one data row');
    }
    
    // Convert to objects with headers
    const headers = jsonData[0] as string[];
    const data = jsonData.slice(1).map((row: any[]) => {
      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header.trim()] = row[index] || '';
      });
      return obj;
    });
    
    return data;
  } catch (error) {
    throw new Error(`Excel parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Function to transform and validate data
function transformToOrder(row: any, headerMapping: Record<string, number>, originalHeaders: string[]): Partial<Order> | null {
  try {
    const order: Partial<Order> = {};
    
    // Map fields using the header mapping
    Object.entries(headerMapping).forEach(([dbField, columnIndex]) => {
      const header = originalHeaders[columnIndex];
      let value = row[header];
      
      // Skip empty values
      if (value === null || value === undefined || value === '') {
        return;
      }
      
      // Type conversions based on field
      switch (dbField) {
        case 'total_paid':
        case 'package_price':
        case 'postage':
          const numValue = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
          if (!isNaN(numValue)) {
            (order as any)[dbField] = numValue;
          }
          break;
          
        case 'wash_qty':
        case 'femlift_30ml_qty':
        case 'femlift_10ml_qty':
        case 'wash_30ml_qty':
        case 'spray_qty':
          const intValue = parseInt(String(value));
          if (!isNaN(intValue)) {
            (order as any)[dbField] = intValue;
          }
          break;
          
        case 'order_date':
          // Handle various date formats
          const dateValue = new Date(value);
          if (!isNaN(dateValue.getTime())) {
            order.order_date = dateValue.toISOString();
          }
          break;
          
        case 'new_or_repeat':
          const typeValue = String(value).toLowerCase();
          if (typeValue.includes('new')) {
            order.new_or_repeat = 'new';
          } else if (typeValue.includes('repeat')) {
            order.new_or_repeat = 'repeat';
          }
          break;
          
        default:
          // String fields
          (order as any)[dbField] = String(value).trim();
      }
    });
    
    // Set defaults
    if (!order.order_date) {
      order.order_date = new Date().toISOString();
    }
    
    if (!order.currency) {
      order.currency = 'MYR';
    }
    
    if (!order.status) {
      order.status = 'completed';
    }
    
    // Add timestamps
    order.created_at = new Date().toISOString();
    order.updated_at = new Date().toISOString();
    
    return order;
  } catch (error) {
    console.error('Error transforming row:', error, row);
    return null;
  }
}

// Validation function
function validateImportData(data: any[], headerMapping: Record<string, number>, originalHeaders: string[]): ImportValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const preview: any[] = [];
  let validRows = 0;
  
  // Check if required fields are mapped
  const requiredFields = ['customer_name', 'phone_number'];
  const missingRequired = requiredFields.filter(field => !(field in headerMapping));
  
  if (missingRequired.length > 0) {
    errors.push(`Missing required columns: ${missingRequired.join(', ')}`);
  }
  
  // Validate sample of data
  const sampleSize = Math.min(data.length, 5);
  for (let i = 0; i < sampleSize; i++) {
    const row = data[i];
    const transformed = transformToOrder(row, headerMapping, originalHeaders);
    
    if (transformed) {
      preview.push({
        original: row,
        transformed,
        rowNumber: i + 1
      });
      validRows++;
    } else {
      warnings.push(`Row ${i + 1}: Could not transform data`);
    }
  }
  
  // Count total valid rows
  for (let i = sampleSize; i < data.length; i++) {
    const row = data[i];
    const transformed = transformToOrder(row, headerMapping, originalHeaders);
    if (transformed) {
      validRows++;
    }
  }
  
  return {
    isValid: errors.length === 0 && validRows > 0,
    errors,
    warnings,
    preview,
    totalRows: data.length,
    validRows
  };
}

// POST /api/import/validate - Validate uploaded file without importing
importRouter.post('/validate', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }
    
    console.log(`📁 Validating file: ${req.file.originalname} (${req.file.size} bytes)`);
    
    let data: any[];
    
    // Parse based on file type
    if (req.file.originalname.endsWith('.csv') || req.file.mimetype === 'text/csv') {
      data = await parseCSV(req.file.buffer);
    } else {
      data = parseExcel(req.file.buffer);
    }
    
    if (data.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No data found in file'
      });
    }
    
    // Get headers and create mapping
    const originalHeaders = Object.keys(data[0]);
    const headerMapping = mapHeaders(originalHeaders);
    
    console.log('📋 Detected headers:', originalHeaders);
    console.log('🔗 Field mapping:', headerMapping);
    
    // Validate the data
    const validation = validateImportData(data, headerMapping, originalHeaders);
    
    res.json({
      success: true,
      data: {
        filename: req.file.originalname,
        fileSize: req.file.size,
        detectedHeaders: originalHeaders,
        fieldMapping: headerMapping,
        validation,
        summary: {
          totalRows: data.length,
          validRows: validation.validRows,
          mappedFields: Object.keys(headerMapping).length,
          requiredFieldsMapped: ['customer_name', 'phone_number'].filter(f => f in headerMapping).length
        }
      }
    });
    
  } catch (error) {
    console.error('❌ File validation failed:', error);
    res.status(500).json({
      success: false,
      error: 'File validation failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/import/execute - Execute the import after validation
importRouter.post('/execute', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }
    
    const { 
      skipDuplicates = true,
      batchSize = 100,
      validateOnly = false
    } = req.body;
    
    console.log(`📥 Importing file: ${req.file.originalname}`);
    console.log(`⚙️ Options: skipDuplicates=${skipDuplicates}, batchSize=${batchSize}`);
    
    let data: any[];
    
    // Parse file
    if (req.file.originalname.endsWith('.csv') || req.file.mimetype === 'text/csv') {
      data = await parseCSV(req.file.buffer);
    } else {
      data = parseExcel(req.file.buffer);
    }
    
    const originalHeaders = Object.keys(data[0]);
    const headerMapping = mapHeaders(originalHeaders);
    
    // Validate first
    const validation = validateImportData(data, headerMapping, originalHeaders);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.errors
      });
    }
    
    if (validateOnly) {
      return res.json({
        success: true,
        message: 'Validation passed - ready for import',
        validation
      });
    }
    
    // Transform all data
    const orders: Order[] = [];
    const transformErrors: any[] = [];
    
    for (let i = 0; i < data.length; i++) {
      const transformed = transformToOrder(data[i], headerMapping, originalHeaders);
      if (transformed) {
        orders.push(transformed as Order);
      } else {
        transformErrors.push({
          row: i + 1,
          data: data[i],
          error: 'Failed to transform row'
        });
      }
    }
    
    if (orders.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid orders found after transformation'
      });
    }
    
    // Check for duplicates if enabled
    let duplicatesSkipped = 0;
    let ordersToInsert = orders;
    
    if (skipDuplicates) {
      console.log('🔍 Checking for duplicate phone numbers...');
      
      const phoneNumbers = orders.map(o => o.phone_number).filter(Boolean);
      const { data: existingOrders } = await supabase
        .from('orders')
        .select('phone_number')
        .in('phone_number', phoneNumbers);
      
      const existingPhones = new Set(existingOrders?.map(o => o.phone_number) || []);
      
      ordersToInsert = orders.filter(order => {
        if (order.phone_number && existingPhones.has(order.phone_number)) {
          duplicatesSkipped++;
          return false;
        }
        return true;
      });
      
      console.log(`📋 Found ${duplicatesSkipped} duplicates to skip`);
    }
    
    // Import in batches
    let successfulInserts = 0;
    let failedInserts = 0;
    const importErrors: any[] = [];
    
    for (let i = 0; i < ordersToInsert.length; i += batchSize) {
      const batch = ordersToInsert.slice(i, i + batchSize);
      
      try {
        console.log(`📦 Importing batch ${Math.floor(i / batchSize) + 1} (${batch.length} orders)...`);
        await bulkInsertOrders(batch);
        successfulInserts += batch.length;
      } catch (error) {
        console.error(`❌ Batch import failed:`, error);
        failedInserts += batch.length;
        importErrors.push({
          batch: Math.floor(i / batchSize) + 1,
          size: batch.length,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    const result: ImportResult = {
      success: successfulInserts > 0,
      totalProcessed: data.length,
      successfulInserts,
      failedInserts,
      errors: [...transformErrors, ...importErrors],
      duplicatesSkipped: skipDuplicates ? duplicatesSkipped : undefined
    };
    
    console.log(`✅ Import completed:`, result);
    
    res.json({
      success: true,
      data: result,
      message: `Import completed. ${successfulInserts} orders imported successfully.`
    });
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    res.status(500).json({
      success: false,
      error: 'Import failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /api/import/template - Download a CSV template
importRouter.get('/template', (req, res) => {
  const template = [
    'customer_name,phone_number,total_paid,order_date,currency,payment_method,wash_qty,femlift_30ml_qty,femlift_10ml_qty,wash_30ml_qty,spray_qty,tracking_number,courier_company,status,new_or_repeat,agent_name,remark',
    'John Doe,+60123456789,150.00,2024-08-01,MYR,Credit Card,1,1,0,0,1,TN123456,PosLaju,completed,new,Agent 1,Sample order',
    'Jane Smith,+60987654321,200.00,2024-08-02,MYR,Bank Transfer,0,2,1,1,0,TN123457,Ninja Van,completed,repeat,Agent 2,Repeat customer'
  ].join('\n');
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="order_import_template.csv"');
  res.send(template);
});

export default importRouter;