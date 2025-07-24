export interface Order {
  id?: number;
  order_date?: Date | string; // Use Date for internal processing, string for JSON serialization
  fb_name?: string;
  customer_name?: string;
  payment_method?: string;
  wash_qty?: number;
  femlift_30ml_qty?: number;
  femlift_10ml_qty?: number;
  wash_30ml_qty?: number;
  spray_qty?: number;
  remark?: string;
  package_price?: number;
  postage?: number;
  total_paid?: number;
  shipment_description?: string;
  phone_number?: string;
  tracking_number?: string;
  courier_company?: string;
  status?: string;
  new_or_repeat?: "new" | "repeat";
  cash_sale_receipt?: string;
  agent_name?: string;
  currency?: string;
  created_at?: string;
}

interface SheetToDBMapping {
  [key: string]: string;
}

// Define mapping between Google Sheets columns and database fields
export const COLUMN_MAPPING: SheetToDBMapping = {
  no: "id",
  "order date": "order_date",
  fbname: "fb_name",
  name: "customer_name",
  "payment method": "payment_method",
  wash: "wash_qty",
  "femlift 30ml": "femlift_30ml_qty",
  "femlift 10ml": "femlift_10ml_qty",
  "wash 30ml": "wash_30ml_qty",
  spray: "spray_qty",
  remark: "remark",
  "package (rm)": "package_price",
  "postage (rm)": "postage",
  "total paid (rm)": "total_paid",
  "shipment description": "shipment_description",
  "phone number": "phone_number",
  "tracking number": "tracking_number",
  "courires company": "courier_company", // typo preserved
  status: "status",
  "new/repeat": "new_or_repeat",
  "cash sale receipt": "cash_sale_receipt",
  "agent by / under": "agent_name",
  currency: "currency",
};
