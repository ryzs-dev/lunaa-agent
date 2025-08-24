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
    const { data, error } = await supabase
      .from("customers")
      .upsert(
        {
          ...customerData,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "phone_number",
          ignoreDuplicates: false,
        }
      )
      .select()
      .single();

    if (error) {
      console.error("❌ Failed to upsert customer:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("❌ Error in upsertCustomer:", error);
    throw error;
  }
}

export async function getCustomerByPhone(
  phoneNumber: string
): Promise<Customer | null> {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("phone_number", phoneNumber)
      .maybeSingle();

    if (error) {
      console.error("❌ Failed to get customer:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("❌ Error in getCustomerByPhone:", error);
    throw error;
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
  payment_method?: string;
  source?: string;
  agent_name?: string;
  notes?: string;
  address?: string;
  city?: string;
  postcode?: string;
  state?: string;
}): Promise<Order> {
  try {
    const customer = await upsertCustomer({
      customer_name: orderData.customer_name,
      phone_number: orderData.phone_number,
      fb_name: orderData.fb_name,
      customer_type: "new",
    });

    let addressId: number | undefined;
    if (orderData.address) {
      try {
        const address = await upsertAddress({
          customer_id: customer.id!,
          address_line_1: orderData.address,
          city: orderData.city,
          postcode: orderData.postcode,
          state: orderData.state,
          address_type: "shipping",
          is_default: true,
        });
        addressId = address.id;
      } catch (addressError) {
        console.log(
          "⚠️ Could not create address, continuing without it:",
          addressError
        );
      }
    }

    const orderNumber = await generateOrderNumber();

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_number: orderNumber,
        customer_id: customer.id,
        shipping_address_id: addressId,
        total_amount: orderData.total_amount,
        subtotal: orderData.total_amount,
        payment_method: orderData.payment_method,
        source: orderData.source || "whatsapp",
        agent_name: orderData.agent_name,
        notes: orderData.notes,
        status: "pending",
        payment_status: "pending",
        currency: "MYR",
        order_date: new Date().toISOString(),
      })
      .select()
      .single();

    if (orderError) {
      console.error("❌ Failed to create order:", orderError);
      throw orderError;
    }

    return order;
  } catch (error) {
    console.error("❌ Error in createSimpleOrder:", error);
    throw error;
  }
}

async function generateOrderNumber(): Promise<string> {
  try {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");

    const { count } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .gte("created_at", `${year}-${month}-01`)
      .lt(
        "created_at",
        `${year}-${month === "12" ? year + 1 : year}-${
          month === "12" ? "01" : String(parseInt(month) + 1).padStart(2, "0")
        }-01`
      );

    const sequence = String((count || 0) + 1).padStart(4, "0");
    return `ORD-${year}${month}-${sequence}`;
  } catch (error) {
    console.error("❌ Error generating order number:", error);
    return `ORD-${Date.now()}`;
  }
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

// ============================================================================
// LEGACY COMPATIBILITY FUNCTIONS
// ============================================================================

export async function insertOrder(orderData: any): Promise<number> {
  try {
    const order = await createSimpleOrder({
      customer_name: orderData.customer_name || "Unknown",
      phone_number: orderData.phone_number || orderData.phone,
      fb_name: orderData.fb_name,
      total_amount: orderData.total_paid || orderData.total_amount || 0,
      payment_method: orderData.payment_method,
      source: orderData.source || "legacy",
      agent_name: orderData.agent_name,
      notes: orderData.remark || orderData.notes,
      address: orderData.address,
      city: orderData.city,
      postcode: orderData.postcode,
      state: orderData.state,
    });

    return order.id!;
  } catch (error) {
    console.error("❌ Error in legacy insertOrder:", error);
    throw error;
  }
}

export async function bulkInsertOrders(orders: any[]): Promise<void> {
  console.log(
    `📦 Bulk inserting ${orders.length} orders using normalized schema...`
  );
  let successCount = 0;
  let errorCount = 0;

  for (const order of orders) {
    try {
      await insertOrder(order);
      successCount++;
    } catch (error) {
      console.error(`❌ Failed to insert order:`, error);
      errorCount++;
    }
  }

  console.log(
    `✅ Bulk insert completed: ${successCount} success, ${errorCount} errors`
  );
}
