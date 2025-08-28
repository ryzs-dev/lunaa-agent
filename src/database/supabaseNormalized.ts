// src/database/supabaseNormalized.ts - Complete version with all CRUD operations
import dotenv from "dotenv";
import path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// Supabase Client Initialization
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============================================================================
// INTERFACES FOR NORMALIZED SCHEMA
// ============================================================================

export interface Customer {
  id?: number;
  customer_name: string;
  phone_number: string;
  fb_name?: string;
  email?: string;
  customer_type?: "new" | "repeat";
  preferred_language?: "en" | "ms" | "zh";
  notes?: string;
  total_orders?: number;
  total_spent?: number;
  average_order_value?: number;
  last_order_date?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Address {
  id?: number;
  customer_id: number;
  address_line_1: string;
  address_line_2?: string;
  city?: string;
  postcode?: string;
  state?: string;
  country?: string;
  address_type?: "shipping" | "billing" | "both";
  is_default?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Product {
  id?: number;
  product_code: string;
  product_name: string;
  product_type?: string;
  size?: string;
  description?: string;
  base_price?: number;
  is_active?: boolean;
  category?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Package {
  id?: number;
  package_name: string;
  package_code?: string;
  description?: string;
  base_price?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Order {
  id?: number;
  order_number?: string;
  customer_id: number;
  shipping_address_id?: number;
  order_date?: string;
  status?:
    | "pending"
    | "confirmed"
    | "processing"
    | "shipped"
    | "delivered"
    | "cancelled"
    | "refunded";
  subtotal?: number;
  postage?: number;
  website_charges?: number;
  total_amount: number;
  currency?: string;
  payment_method?: string;
  payment_status?: "pending" | "paid" | "failed" | "refunded";
  cash_sale_receipt?: string;
  tracking_number?: string;
  courier_company?: string;
  shipment_description?: string;
  source?: string;
  agent_name?: string;
  notes?: string;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

export interface OrderItem {
  id?: number;
  order_id: number;
  product_id?: number;
  package_id?: number;
  item_type: "product" | "package";
  quantity: number;
  unit_price: number;
  total_price: number;
  notes?: string;
  created_at?: string;
}

export interface Message {
  id?: number;
  sid: string;
  order_id?: number;
  to_number: string;
  from_number: string;
  message_type?: string;
  message_content?: string;
  template_id?: string;
  latest_status: string;
  status_history?: any[];
  error_code?: string;
  error_message?: string;
  sent_at?: string;
  last_updated?: string;
  created_at?: string;
}

export interface Conversation {
  id?: number;
  phone_number: string;
  customer_name?: string;
  last_message_at?: string;
  status?: string;
  assigned_to?: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// CUSTOMER FUNCTIONS
// ============================================================================

export async function upsertCustomer(customerData: {
  customer_name: string;
  phone_number: string;
  fb_name?: string;
  email?: string;
  customer_type?: "new" | "repeat";
}): Promise<Customer> {
  try {
    console.log(`Upserting customer: phone=${customerData.phone_number}, name=${customerData.customer_name}`);
    
    // First, try to find existing customer by phone number
    const { data: existingCustomer, error: findError } = await supabase
      .from("customers")
      .select("*")
      .eq("phone_number", customerData.phone_number)
      .single();

    if (findError && findError.code !== 'PGRST116') {
      throw findError;
    }

    if (existingCustomer) {
      // Customer exists - update their information and increment order count
      console.log(`Found existing customer: id=${existingCustomer.id}, current_orders=${existingCustomer.total_orders || 0}`);
      
      // Determine if this should be marked as repeat customer
      const isRepeatCustomer = (existingCustomer.total_orders || 0) > 0;
      
      const { data: updatedCustomer, error: updateError } = await supabase
        .from("customers")
        .update({
          // Update name if the new one is more complete
          customer_name: customerData.customer_name.length > (existingCustomer.customer_name?.length || 0) 
            ? customerData.customer_name 
            : existingCustomer.customer_name,
          // Update fb_name if provided
          fb_name: customerData.fb_name || existingCustomer.fb_name,
          // Update email if provided
          email: customerData.email || existingCustomer.email,
          // Set as repeat customer if they have previous orders
          customer_type: isRepeatCustomer ? 'repeat' : customerData.customer_type || existingCustomer.customer_type,
          updated_at: new Date().toISOString(),
        })
        .eq("phone_number", customerData.phone_number)
        .select()
        .single();

      if (updateError) throw updateError;
      
      console.log(`Updated existing customer: id=${updatedCustomer.id}, name=${updatedCustomer.customer_name}, type=${updatedCustomer.customer_type}`);
      return updatedCustomer;
      
    } else {
      // Customer doesn't exist - create new one
      const { data: newCustomer, error: insertError } = await supabase
        .from("customers")
        .insert({
          ...customerData,
          customer_type: 'new', // First-time customers are always 'new'
          total_orders: 0,
          total_spent: 0,
          average_order_value: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) throw insertError;
      
      console.log(`Created new customer: id=${newCustomer.id}, phone=${newCustomer.phone_number}`);
      return newCustomer;
    }

  } catch (error) {
    console.error("Error in upsertCustomer:", error);
    throw error;
  }
}

export async function updateCustomerStats(customerId: number, orderAmount: number): Promise<void> {
  try {
    // Get current customer stats
    const { data: customer, error: fetchError } = await supabase
      .from("customers")
      .select("total_orders, total_spent, average_order_value")
      .eq("id", customerId)
      .single();

    if (fetchError) throw fetchError;

    const currentOrders = (customer.total_orders || 0) + 1;
    const currentSpent = (customer.total_spent || 0) + orderAmount;
    const newAverageOrderValue = currentSpent / currentOrders;

    // Update customer stats
    const { error: updateError } = await supabase
      .from("customers")
      .update({
        total_orders: currentOrders,
        total_spent: currentSpent,
        average_order_value: newAverageOrderValue,
        last_order_date: new Date().toISOString(),
        // Update customer type to repeat if they now have multiple orders
        customer_type: currentOrders > 1 ? 'repeat' : 'new',
        updated_at: new Date().toISOString(),
      })
      .eq("id", customerId);

    if (updateError) throw updateError;

    console.log(`Updated customer stats: id=${customerId}, orders=${currentOrders}, spent=${currentSpent.toFixed(2)}, avg=${newAverageOrderValue.toFixed(2)}`);
    
  } catch (error) {
    console.error("Error updating customer stats:", error);
    throw error;
  }
}

export async function getCustomerByPhone(req: any, res: any) {
  try {
    const { phoneNumber } = req.params;
    
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: "Phone number is required"
      });
    }

    const result = await getCustomerOrderHistory(phoneNumber);
    
    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error("Error in getCustomerByPhoneEndpoint:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get customer data",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function getCustomerWithAddresses(
  customerId: number
): Promise<(Customer & { addresses: Address[] }) | null> {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select(
        `
        *,
        addresses (*)
      `
      )
      .eq("id", customerId)
      .maybeSingle();

    if (error) {
      console.error("❌ Failed to get customer with addresses:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("❌ Error in getCustomerWithAddresses:", error);
    throw error;
  }
}

// ============================================================================
// ADDRESS FUNCTIONS
// ============================================================================

export async function upsertAddress(
  addressData: Omit<Address, "id" | "created_at" | "updated_at">
): Promise<Address> {
  try {
    if (addressData.is_default) {
      await supabase
        .from("addresses")
        .update({ is_default: false })
        .eq("customer_id", addressData.customer_id);
    }

    const { data, error } = await supabase
      .from("addresses")
      .insert({
        ...addressData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("❌ Failed to insert address:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("❌ Error in upsertAddress:", error);
    throw error;
  }
}

export async function getCustomerAddresses(
  customerId: number
): Promise<Address[]> {
  try {
    const { data, error } = await supabase
      .from("addresses")
      .select("*")
      .eq("customer_id", customerId)
      .order("is_default", { ascending: false });

    if (error) {
      console.error("❌ Failed to get customer addresses:", error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error("❌ Error in getCustomerAddresses:", error);
    return [];
  }
}

// ============================================================================
// PRODUCT FUNCTIONS
// ============================================================================

export async function getProducts(): Promise<Product[]> {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("product_name");

    if (error) {
      console.error("❌ Failed to get products:", error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error("❌ Error in getProducts:", error);
    return [];
  }
}

export async function getProductByCode(
  productCode: string
): Promise<Product | null> {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("product_code", productCode)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("❌ Failed to get product:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("❌ Error in getProductByCode:", error);
    return null;
  }
}

export async function createProduct(
  productData: Omit<Product, "id" | "created_at" | "updated_at">
): Promise<Product> {
  try {
    const { data, error } = await supabase
      .from("products")
      .insert({
        ...productData,
        is_active: productData.is_active ?? true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("❌ Failed to create product:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("❌ Error in createProduct:", error);
    throw error;
  }
}

export async function updateProduct(
  productId: number,
  updates: Partial<Product>
): Promise<Product> {
  try {
    const { data, error } = await supabase
      .from("products")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId)
      .select()
      .single();

    if (error) {
      console.error("❌ Failed to update product:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("❌ Error in updateProduct:", error);
    throw error;
  }
}

export async function deleteProduct(
  productId: number,
  hardDelete = false
): Promise<void> {
  try {
    if (hardDelete) {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", productId);

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("products")
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", productId);

      if (error) throw error;
    }
  } catch (error) {
    console.error("❌ Error in deleteProduct:", error);
    throw error;
  }
}

// ============================================================================
// PACKAGE FUNCTIONS
// ============================================================================

export async function getPackages(): Promise<Package[]> {
  try {
    const { data, error } = await supabase
      .from("packages")
      .select("*")
      .eq("is_active", true)
      .order("package_name");

    if (error) {
      console.error("❌ Failed to get packages:", error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error("❌ Error in getPackages:", error);
    return [];
  }
}

export async function getPackageByCode(
  packageCode: string
): Promise<Package | null> {
  try {
    const { data, error } = await supabase
      .from("packages")
      .select("*")
      .eq("package_code", packageCode)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("❌ Failed to get package:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("❌ Error in getPackageByCode:", error);
    return null;
  }
}

export async function createPackage(
  packageData: Omit<Package, "id" | "created_at" | "updated_at">
): Promise<Package> {
  try {
    const { data, error } = await supabase
      .from("packages")
      .insert({
        ...packageData,
        is_active: packageData.is_active ?? true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("❌ Failed to create package:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("❌ Error in createPackage:", error);
    throw error;
  }
}

export async function updatePackage(
  packageId: number,
  updates: Partial<Package>
): Promise<Package> {
  try {
    const { data, error } = await supabase
      .from("packages")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", packageId)
      .select()
      .single();

    if (error) {
      console.error("❌ Failed to update package:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("❌ Error in updatePackage:", error);
    throw error;
  }
}

export async function deletePackage(
  packageId: number,
  hardDelete = false
): Promise<void> {
  try {
    if (hardDelete) {
      const { error } = await supabase
        .from("packages")
        .delete()
        .eq("id", packageId);

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("packages")
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", packageId);

      if (error) throw error;
    }
  } catch (error) {
    console.error("❌ Error in deletePackage:", error);
    throw error;
  }
}

// ============================================================================
// ORDER FUNCTIONS
// ============================================================================

export async function createSimpleOrder(orderData: {
  customer_name: string;
  phone_number: string;
  fb_name?: string;
  total_amount: number;
  subtotal?: number;
  postage?: number;
  website_charges?: number;
  payment_method?: string;
  payment_status?: string;
  source?: string;
  agent_name?: string;
  notes?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  postcode?: string;
  state?: string;
  country?: string;
  currency?: string;
  shipment_description?: string;
  tracking_number?: string;
  courier_company?: string;
  customer_type?: 'new' | 'repeat';
}): Promise<Order> {
  try {
    console.log(`Creating order: phone=${orderData.phone_number}, amount=${orderData.total_amount}`);

    // 1. Upsert customer (handles phone number deduplication)
    const customer = await upsertCustomer({
      customer_name: orderData.customer_name,
      phone_number: orderData.phone_number,
      fb_name: orderData.fb_name,
      customer_type: orderData.customer_type || 'new',
    });

    // 2. Create address if provided
    let addressId: number | undefined;
    if (orderData.address_line_1) {
      try {
        const address = await upsertAddress({
          customer_id: customer.id!,
          address_line_1: orderData.address_line_1,
          address_line_2: orderData.address_line_2,
          city: orderData.city,
          postcode: orderData.postcode,
          state: orderData.state,
          country: orderData.country || 'Malaysia',
          address_type: "shipping",
          is_default: true,
        });
        addressId = address.id;
        console.log(`Created/updated address: id=${addressId}`);
      } catch (addressError) {
        console.log("Could not create address:", addressError);
      }
    }

    // 3. Generate unique order number
    const orderNumber = await generateUniqueOrderNumber();
    console.log(`Generated order number: ${orderNumber}`);
    
    // 4. Create the order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_number: orderNumber,
        customer_id: customer.id,
        shipping_address_id: addressId,
        total_amount: orderData.total_amount,
        subtotal: orderData.subtotal || orderData.total_amount,
        postage: orderData.postage || 0,
        website_charges: orderData.website_charges || 0,
        payment_method: orderData.payment_method || 'cash',
        payment_status: orderData.payment_status || 'pending',
        source: orderData.source || "api",
        agent_name: orderData.agent_name || 'System',
        notes: orderData.notes,
        status: "pending",
        currency: orderData.currency || "MYR",
        order_date: new Date().toISOString(),
        shipment_description: orderData.shipment_description || '',
        tracking_number: orderData.tracking_number || '',
        courier_company: orderData.courier_company || '',
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // 5. Update customer statistics
    await updateCustomerStats(customer.id!, orderData.total_amount);

    console.log(`Order created successfully: id=${order.id}, customer_id=${customer.id}, phone=${orderData.phone_number}`);
    return order;
    
  } catch (error) {
    console.error("Error in createSimpleOrder:", error);
    throw error;
  }
}


async function generateUniqueOrderNumber(maxRetries = 10): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const yearMonth = `${year}${month}`;
      
      // Add small delay between attempts to reduce collisions
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
      }
      
      // Get the highest existing order number for this month to ensure sequential numbering
      const { data: latestOrder, error: queryError } = await supabase
        .from("orders")
        .select("order_number")
        .like("order_number", `ORD-${yearMonth}-%`)
        .order("order_number", { ascending: false })
        .limit(1)
        .single();
      
      if (queryError && queryError.code !== 'PGRST116') { // PGRST116 = no rows found
        console.log(`Query error on attempt ${attempt + 1}:`, queryError);
        continue; // Retry on query errors
      }
      
      let nextSequence = 1;
      
      // Extract sequence from the latest order number
      if (latestOrder?.order_number) {
        const parts = latestOrder.order_number.split('-');
        if (parts.length === 3 && parts[0] === 'ORD' && parts[1] === yearMonth) {
          const lastSequence = parseInt(parts[2]);
          if (!isNaN(lastSequence)) {
            nextSequence = lastSequence + 1;
          }
        }
      }
      
      // Add attempt offset to reduce collisions during concurrent requests
      const finalSequence = nextSequence + attempt;
      const sequence = String(finalSequence).padStart(4, "0");
      const orderNumber = `ORD-${yearMonth}-${sequence}`;
      
      // Verify this number doesn't exist (double-check)
      const { data: existing, error: checkError } = await supabase
        .from("orders")
        .select("order_number")
        .eq("order_number", orderNumber)
        .single();
      
      if (checkError && checkError.code === 'PGRST116') {
        // No existing order found - this number is available
        console.log(`Generated unique order number: ${orderNumber} (attempt ${attempt + 1})`);
        return orderNumber;
      } else if (checkError) {
        console.log(`Check error on attempt ${attempt + 1}:`, checkError);
        continue; // Retry on check errors
      } else {
        console.log(`Order number ${orderNumber} already exists, retrying (attempt ${attempt + 1})`);
        continue; // Number exists, retry
      }
      
    } catch (error) {
      console.error(`Error generating order number (attempt ${attempt + 1}):`, error);
      
      if (attempt === maxRetries - 1) {
        console.error("Max retries exceeded, falling back to timestamp");
        break;
      }
    }
  }
  
  // Fallback to timestamp-based (this should rarely happen now)
  const fallbackNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  console.warn(`Using fallback order number: ${fallbackNumber}`);
  return fallbackNumber;
}

export async function getRecentOrders(limit = 50): Promise<Order[]> {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        *,
        customers (
          customer_name,
          phone_number,
          fb_name
        )
      `
      )
      .order("order_date", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("❌ Failed to get recent orders:", error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error("❌ Error in getRecentOrders:", error);
    return [];
  }
}

export async function searchOrders(query: {
  searchTerm?: string;
  status?: string;
  customerId?: number;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}): Promise<{ orders: Order[]; totalCount: number }> {
  try {
    let orderQuery = supabase.from("orders").select(
      `
        *,
        customers (
          customer_name,
          phone_number,
          fb_name
        )
      `,
      { count: "exact" }
    );

    if (query.searchTerm) {
      orderQuery = orderQuery.or(
        `order_number.ilike.%${query.searchTerm}%,tracking_number.ilike.%${query.searchTerm}%`
      );
    }

    if (query.status) {
      orderQuery = orderQuery.eq("status", query.status);
    }

    if (query.customerId) {
      orderQuery = orderQuery.eq("customer_id", query.customerId);
    }

    if (query.startDate) {
      orderQuery = orderQuery.gte("order_date", query.startDate);
    }

    if (query.endDate) {
      orderQuery = orderQuery.lte("order_date", query.endDate);
    }

    if (query.offset && query.limit) {
      orderQuery = orderQuery.range(
        query.offset,
        query.offset + query.limit - 1
      );
    } else if (query.limit) {
      orderQuery = orderQuery.limit(query.limit);
    }

    orderQuery = orderQuery.order("order_date", { ascending: false });

    const { data, error, count } = await orderQuery;

    if (error) {
      console.error("❌ Failed to search orders:", error);
      throw error;
    }

    return {
      orders: data || [],
      totalCount: count || 0,
    };
  } catch (error) {
    console.error("❌ Error in searchOrders:", error);
    return { orders: [], totalCount: 0 };
  }
}

export async function getDashboardStats(filters?: {
  startDate?: string;
  endDate?: string;
  customerId?: number;
}) {
  try {
    let orderQuery = supabase
      .from("orders")
      .select("total_amount, currency, customer_id, status, order_date");

    if (filters?.startDate) {
      orderQuery = orderQuery.gte("order_date", filters.startDate);
    }
    if (filters?.endDate) {
      orderQuery = orderQuery.lte("order_date", filters.endDate);
    }
    if (filters?.customerId) {
      orderQuery = orderQuery.eq("customer_id", filters.customerId);
    }

    const { data: orders, error: ordersError } = await orderQuery;
    if (ordersError) throw ordersError;

    const { count: customersCount, error: customersError } = await supabase
      .from("customers")
      .select("*", { count: "exact", head: true });
    if (customersError) throw customersError;

    const totalOrders = orders?.length || 0;
    const totalRevenue =
      orders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return {
      totalOrders,
      totalRevenue,
      avgOrderValue,
      totalCustomers: customersCount || 0,
      ordersByStatus:
        orders?.reduce((acc, order) => {
          acc[order.status || "unknown"] =
            (acc[order.status || "unknown"] || 0) + 1;
          return acc;
        }, {} as Record<string, number>) || {},
    };
  } catch (error) {
    console.error("❌ Error in getDashboardStats:", error);
    return {
      totalOrders: 0,
      totalRevenue: 0,
      avgOrderValue: 0,
      totalCustomers: 0,
      ordersByStatus: {},
    };
  }
}

export async function getCustomerOrderHistory(phoneNumber: string): Promise<{
  customer: Customer | null;
  orders: Order[];
  stats: {
    totalOrders: number;
    totalSpent: number;
    averageOrderValue: number;
    firstOrderDate: string | null;
    lastOrderDate: string | null;
  }
}> {
  try {
    // Get customer by phone number
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("*")
      .eq("phone_number", phoneNumber)
      .single();

    if (customerError && customerError.code !== 'PGRST116') {
      throw customerError;
    }

    if (!customer) {
      return {
        customer: null,
        orders: [],
        stats: {
          totalOrders: 0,
          totalSpent: 0,
          averageOrderValue: 0,
          firstOrderDate: null,
          lastOrderDate: null
        }
      };
    }

    // Get all orders for this customer
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("*")
      .eq("customer_id", customer.id)
      .order("order_date", { ascending: false });

    if (ordersError) throw ordersError;

    // Calculate stats
    const totalOrders = orders?.length || 0;
    const totalSpent = orders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
    const averageOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;
    const firstOrderDate = totalOrders > 0 ? orders[orders.length - 1].order_date : null;
    const lastOrderDate = totalOrders > 0 ? orders[0].order_date : null;

    return {
      customer,
      orders: orders || [],
      stats: {
        totalOrders,
        totalSpent,
        averageOrderValue,
        firstOrderDate,
        lastOrderDate
      }
    };

  } catch (error) {
    console.error("Error getting customer order history:", error);
    throw error;
  }
}

export async function findDuplicateCustomers(): Promise<Array<{
  phone_number: string;
  customers: Customer[];
  total_orders: number;
}>> {
  try {
    // Find phone numbers with multiple customer records
    const { data: duplicates, error } = await supabase
      .from("customers")
      .select(`
        phone_number,
        id,
        customer_name,
        total_orders,
        created_at
      `)
      .order("phone_number");

    if (error) throw error;

    // Group by phone number
    const phoneGroups = duplicates.reduce((acc, customer) => {
      if (!acc[customer.phone_number]) {
        acc[customer.phone_number] = [];
      }
      acc[customer.phone_number].push(customer);
      return acc;
    }, {} as Record<string, Customer[]>);

    // Return only phone numbers with multiple customers
    return Object.entries(phoneGroups)
      .filter(([_, customers]) => customers.length > 1)
      .map(([phone_number, customers]) => ({
        phone_number,
        customers,
        total_orders: customers.reduce((sum, c) => sum + (c.total_orders || 0), 0)
      }));

  } catch (error) {
    console.error("Error finding duplicate customers:", error);
    throw error;
  }
}

// ============================================================================
// ORDER ITEMS FUNCTIONS
// ============================================================================

export async function addOrderItem(
  orderItem: Omit<OrderItem, "id" | "created_at">
): Promise<OrderItem> {
  try {
    const { data, error } = await supabase
      .from("order_items")
      .insert({
        ...orderItem,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("❌ Failed to add order item:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("❌ Error in addOrderItem:", error);
    throw error;
  }
}

export async function getOrderItems(orderId: number): Promise<OrderItem[]> {
  try {
    const { data, error } = await supabase
      .from("order_items")
      .select(
        `
        *,
        products (
          product_name,
          product_code
        ),
        packages (
          package_name,
          package_code
        )
      `
      )
      .eq("order_id", orderId);

    if (error) {
      console.error("❌ Failed to get order items:", error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error("❌ Error in getOrderItems:", error);
    return [];
  }
}

export async function updateOrderItem(
  itemId: number,
  updates: Partial<OrderItem>
): Promise<OrderItem> {
  try {
    const { data, error } = await supabase
      .from("order_items")
      .update(updates)
      .eq("id", itemId)
      .select()
      .single();

    if (error) {
      console.error("❌ Failed to update order item:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("❌ Error in updateOrderItem:", error);
    throw error;
  }
}

export async function deleteOrderItem(itemId: number): Promise<void> {
  try {
    const { error } = await supabase
      .from("order_items")
      .delete()
      .eq("id", itemId);

    if (error) {
      console.error("❌ Failed to delete order item:", error);
      throw error;
    }
  } catch (error) {
    console.error("❌ Error in deleteOrderItem:", error);
    throw error;
  }
}

// ============================================================================
// COMPLEX ORDER CREATION WITH ITEMS
// ============================================================================

export async function createOrderWithItems(orderData: {
  customer_name: string;
  phone_number: string;
  fb_name?: string;
  payment_method?: string;
  source?: string;
  agent_name?: string;
  notes?: string;
  address?: string;
  city?: string;
  postcode?: string;
  state?: string;
  items: Array<{
    type: "product" | "package";
    id: number;
    quantity: number;
    unit_price: number;
    notes?: string;
  }>;
  postage?: number;
  website_charges?: number;
}): Promise<{ order: Order; items: OrderItem[] }> {
  try {
    // Calculate total amount
    const itemsTotal = orderData.items.reduce(
      (sum, item) => sum + item.quantity * item.unit_price,
      0
    );
    const totalAmount =
      itemsTotal + (orderData.postage || 0) + (orderData.website_charges || 0);

    // Create the order
    const order = await createSimpleOrder({
      ...orderData,
      total_amount: totalAmount,
    });

    // Update order with calculated amounts
    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({
        subtotal: itemsTotal,
        postage: orderData.postage || 0,
        website_charges: orderData.website_charges || 0,
        total_amount: totalAmount,
      })
      .eq("id", order.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Add order items
    const orderItems: OrderItem[] = [];
    for (const item of orderData.items) {
      const orderItem = await addOrderItem({
        order_id: order.id!,
        product_id: item.type === "product" ? item.id : undefined,
        package_id: item.type === "package" ? item.id : undefined,
        item_type: item.type,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.quantity * item.unit_price,
        notes: item.notes,
      });
      orderItems.push(orderItem);
    }

    return {
      order: updatedOrder,
      items: orderItems,
    };
  } catch (error) {
    console.error("❌ Error in createOrderWithItems:", error);
    throw error;
  }
}

// ============================================================================
// MESSAGE FUNCTIONS
// ============================================================================

export async function insertMessage(message: Message): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("messages")
      .insert([message])
      .select("id")
      .single();

    if (error) {
      console.error("❌ Failed to insert message:", error);
      throw error;
    }

    return data.id;
  } catch (error) {
    console.error("❌ Error in insertMessage:", error);
    throw error;
  }
}

export async function upsertConversation(
  phoneNumber: string,
  lastMessageAt?: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from("conversations")
      .upsert({
        phone_number: phoneNumber,
        last_message_at: lastMessageAt || new Date().toISOString(),
      })
      .eq("phone_number", phoneNumber);

    if (error) {
      console.error("❌ Failed to upsert conversation:", error);
      throw error;
    }
  } catch (error) {
    console.error("❌ Error in upsertConversation:", error);
    throw error;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export async function testNormalizedConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from("customers").select("id").limit(1);
    if (error) {
      console.error("❌ Normalized schema connection test failed:", error);
      return false;
    }
    console.log("✅ Normalized Supabase connection successful");
    return true;
  } catch (error) {
    console.error("❌ Normalized Supabase connection failed:", error);
    return false;
  }
}
