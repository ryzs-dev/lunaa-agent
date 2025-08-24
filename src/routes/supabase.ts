import express from "express";
import { 
  createSimpleOrder,
  searchOrders,
  getRecentOrders,
  getDashboardStats,
  supabase,
  insertMessage,
  upsertConversation,
  bulkInsertOrders,
  Order
} from "../database/supabaseNormalized"; // ✅ FIXED: Using normalized schema

const supabaseRouter = express.Router();

// GET /api/supabase/orders - Fetch orders from Supabase with filters
supabaseRouter.get("/orders", async (req, res) => {
  try {
    const { 
      limit = 100, 
      offset = 0, 
      startDate, 
      endDate,
      status,
      currency,
      month // For processing specific months like August
    } = req.query;

    // Use the searchOrders function from normalized schema
    const searchQuery: any = {
      limit: Number(limit),
      offset: Number(offset)
    };

    if (startDate) searchQuery.startDate = startDate as string;
    if (endDate) searchQuery.endDate = endDate as string;
    if (status) searchQuery.status = status as string;
    
    // Handle month filtering
    if (month) {
      const year = new Date().getFullYear();
      const monthStart = new Date(year, parseInt(month as string) - 1, 1).toISOString();
      const monthEnd = new Date(year, parseInt(month as string), 0, 23, 59, 59).toISOString();
      searchQuery.startDate = monthStart;
      searchQuery.endDate = monthEnd;
    }

    const { orders, totalCount } = await searchOrders(searchQuery);

    res.json({
      success: true,
      data: orders,
      pagination: {
        offset: Number(offset),
        limit: Number(limit),
        total: totalCount
      }
    });
  } catch (error) {
    console.error("❌ Supabase query error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch orders",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/supabase/orders - Insert single order
supabaseRouter.post("/orders", async (req, res) => {
  try {
    const orderData = req.body;
    
    // Validate required fields for normalized schema
    if (!orderData.customer_name && !orderData.phone_number) {
      return res.status(400).json({
        success: false,
        error: "Either customer_name or phone_number is required"
      });
    }

    // Use createSimpleOrder from normalized schema
    const order = await createSimpleOrder({
      customer_name: orderData.customer_name || 'Unknown',
      phone_number: orderData.phone_number,
      fb_name: orderData.fb_name,
      total_amount: orderData.total_amount || 0, // ✅ FIXED: total_amount not total_paid
      payment_method: orderData.payment_method,
      source: orderData.source || 'api',
      agent_name: orderData.agent_name,
      notes: orderData.notes,
      address: orderData.address,
      city: orderData.city,
      postcode: orderData.postcode,
      state: orderData.state
    });
    
    res.json({
      success: true,
      data: { id: order.id },
      message: "Order inserted successfully"
    });
  } catch (error) {
    console.error("❌ Failed to insert order:", error);
    res.status(500).json({
      success: false,
      error: "Failed to insert order",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/supabase/orders/bulk - Bulk insert orders (for data migration)
supabaseRouter.post("/orders/bulk", async (req, res) => {
  try {
    const { orders, batchSize = 100 }: { orders: any[], batchSize?: number } = req.body;
    
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Orders array is required and cannot be empty"
      });
    }

    console.log(`📊 Starting bulk insert of ${orders.length} orders...`);

    // Transform orders to match normalized schema
    const transformedOrders = orders.map((order: any) => ({
      customer_name: order.customer_name || order.name || 'Unknown',
      phone_number: order.phone_number || order.phone,
      fb_name: order.fb_name,
      total_amount: parseFloat(order.total_amount || order.total_paid || order.total || 0), // ✅ FIXED
      payment_method: order.payment_method,
      source: order.source || 'bulk_import',
      agent_name: order.agent_name,
      notes: order.notes || order.remark,
      address: order.address,
      city: order.city,
      postcode: order.postcode,
      state: order.state
    }));

    await bulkInsertOrders(transformedOrders);

    res.json({
      success: true,
      data: {
        totalProcessed: orders.length,
        successCount: orders.length,
        errorCount: 0
      },
      message: `Bulk insert completed successfully`
    });
  } catch (error) {
    console.error("❌ Failed to bulk insert orders:", error);
    res.status(500).json({
      success: false,
      error: "Failed to bulk insert orders",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /api/supabase/dashboard-stats - Dashboard statistics from Supabase
supabaseRouter.get("/dashboard-stats", async (req, res) => {
  try {
    const { startDate, endDate, month } = req.query;

    // Build filters for normalized schema
    const filters: any = {};
    
    if (month) {
      const year = new Date().getFullYear();
      const monthStart = new Date(year, parseInt(month as string) - 1, 1).toISOString();
      const monthEnd = new Date(year, parseInt(month as string), 0, 23, 59, 59).toISOString();
      filters.startDate = monthStart;
      filters.endDate = monthEnd;
    } else {
      if (startDate) filters.startDate = startDate as string;
      if (endDate) filters.endDate = endDate as string;
    }

    // Use normalized schema dashboard stats function
    const stats = await getDashboardStats(filters);

    // Get message stats (keeping existing logic)
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("latest_status");
    if (messagesError) throw messagesError;

    // Get conversations count
    const { count: conversationsCount, error: conversationsError } = await supabase
      .from("conversations")
      .select("*", { count: "exact", head: true });
    if (conversationsError) throw conversationsError;

    // Calculate message stats
    const messageStats = {
      total: messages?.length || 0,
      delivered: messages?.filter(m => m.latest_status === "delivered").length || 0,
      failed: messages?.filter(m => m.latest_status === "failed").length || 0,
      pending: messages?.filter(m => ["queued", "sending", "sent"].includes(m.latest_status)).length || 0
    };

    res.json({
      success: true,
      data: {
        orders: {
          total: stats.totalOrders,
          revenue: stats.totalRevenue,
          avgOrderValue: stats.avgOrderValue,
          ordersByStatus: stats.ordersByStatus
        },
        messages: messageStats,
        conversations: {
          total: conversationsCount || 0
        },
        customers: {
          total: stats.totalCustomers
        },
        system: {
          uptime: process.uptime(),
          timestamp: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    console.error("❌ Failed to get dashboard stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get dashboard stats",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /api/supabase/orders/search - Search orders
supabaseRouter.get("/orders/search", async (req, res) => {
  try {
    const { 
      q, // general search query
      phone,
      trackingNumber,
      customerName,
      limit = 50
    } = req.query;

    // Use normalized schema search function
    const searchQuery: any = {
      limit: Number(limit)
    };

    if (q) searchQuery.searchTerm = q as string;
    
    // ✅ FIXED: Use normalized schema search which handles customer joins properly
    const { orders, totalCount } = await searchOrders(searchQuery);

    // Additional filtering for specific fields (since normalized search might not cover all)
    let filteredOrders = orders;
    
    if (phone && !q) {
      filteredOrders = orders.filter((order: any) => 
        order.customers?.phone_number === phone
      );
    }
    
    if (trackingNumber && !q) {
      filteredOrders = orders.filter((order: any) => 
        order.tracking_number === trackingNumber
      );
    }
    
    if (customerName && !q) {
      filteredOrders = orders.filter((order: any) => 
        order.customers?.customer_name?.toLowerCase().includes((customerName as string).toLowerCase())
      );
    }

    res.json({
      success: true,
      data: filteredOrders,
      count: filteredOrders.length
    });
  } catch (error) {
    console.error("❌ Failed to search orders:", error);
    res.status(500).json({
      success: false,
      error: "Failed to search orders",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /api/supabase/orders/:id - Get single order by ID
supabaseRouter.get("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ FIXED: Query with customer join for normalized schema
    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        customers (
          customer_name,
          phone_number,
          fb_name,
          email
        ),
        addresses (
          address_line_1,
          address_line_2,
          city,
          postcode,
          state
        )
      `)
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({
          success: false,
          error: "Order not found"
        });
      }
      throw error;
    }

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error("❌ Failed to get order:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get order",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// PUT /api/supabase/orders/:id - Update order
supabaseRouter.put("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Add updated timestamp
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("orders")
      .update(updates)
      .eq("id", id)
      .select(`
        *,
        customers (
          customer_name,
          phone_number,
          fb_name
        )
      `)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({
          success: false,
          error: "Order not found"
        });
      }
      throw error;
    }

    res.json({
      success: true,
      data,
      message: "Order updated successfully"
    });
  } catch (error) {
    console.error("❌ Failed to update order:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update order",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// DELETE /api/supabase/orders/:id - Delete order
supabaseRouter.delete("/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("id", id);

    if (error) throw error;

    res.json({
      success: true,
      message: "Order deleted successfully"
    });
  } catch (error) {
    console.error("❌ Failed to delete order:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete order",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/supabase/sync/august - Special endpoint for August data migration
supabaseRouter.post("/sync/august", async (req, res) => {
  try {
    const { data: augustData } = req.body;

    if (!Array.isArray(augustData)) {
      return res.status(400).json({
        success: false,
        error: "August data must be an array"
      });
    }

    console.log(`📅 Starting August data sync for ${augustData.length} records...`);

    // ✅ FIXED: Transform data for normalized schema
    const transformedOrders = augustData.map((row: any) => ({
      customer_name: row.customer_name || row.name || row.fb_name || 'Unknown',
      phone_number: row.phone_number || row.phone,
      fb_name: row.fb_name,
      total_amount: parseFloat(row.total_paid || row.total_amount || row.total || 0), // ✅ FIXED
      payment_method: row.payment_method || row.paymentMethod,
      source: 'august_migration',
      agent_name: row.agent_name || row.agent,
      notes: row.remark || row.notes,
      address: row.address,
      city: row.city,
      postcode: row.postcode,
      state: row.state
    }));

    // Use normalized schema bulk insert
    await bulkInsertOrders(transformedOrders);

    res.json({
      success: true,
      data: {
        processed: augustData.length,
        inserted: transformedOrders.length
      },
      message: `Successfully synced ${transformedOrders.length} August orders`
    });
  } catch (error) {
    console.error("❌ Failed to sync August data:", error);
    res.status(500).json({
      success: false,
      error: "Failed to sync August data",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /api/supabase/health - Health check for Supabase connection
supabaseRouter.get("/health", async (req, res) => {
  try {
    // ✅ FIXED: Test both orders and customers tables for normalized schema
    const { data: ordersData, error: ordersError } = await supabase
      .from("orders")
      .select("id")
      .limit(1);

    const { data: customersData, error: customersError } = await supabase
      .from("customers")
      .select("id")
      .limit(1);

    if (ordersError || customersError) {
      throw ordersError || customersError;
    }

    res.json({
      success: true,
      data: {
        status: "healthy",
        timestamp: new Date().toISOString(),
        connection: "active",
        schema: "normalized"
      }
    });
  } catch (error) {
    console.error("❌ Supabase health check failed:", error);
    res.status(500).json({
      success: false,
      error: "Supabase connection failed",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /api/supabase/export/excel - Export orders to Excel
supabaseRouter.get("/export/excel", async (req, res) => {
  try {
    const { startDate, endDate, month } = req.query;

    // Use normalized schema search for export
    const searchQuery: any = {};
    
    if (month) {
      const year = new Date().getFullYear();
      const monthStart = new Date(year, parseInt(month as string) - 1, 1).toISOString();
      const monthEnd = new Date(year, parseInt(month as string), 0, 23, 59, 59).toISOString();
      searchQuery.startDate = monthStart;
      searchQuery.endDate = monthEnd;
    } else {
      if (startDate) searchQuery.startDate = startDate as string;
      if (endDate) searchQuery.endDate = endDate as string;
    }

    const { orders } = await searchOrders(searchQuery);

    // ✅ FIXED: Map normalized schema fields for export
    const csvData = orders.map((order: any) => ({
      "Order ID": order.id,
      "Order Number": order.order_number,
      "Date": order.order_date,
      "Customer": order.customers?.customer_name,
      "Phone": order.customers?.phone_number,
      "Amount": order.total_amount, // ✅ FIXED: total_amount not total_paid
      "Currency": order.currency,
      "Status": order.status,
      "Tracking": order.tracking_number,
      "Agent": order.agent_name,
      "Payment Method": order.payment_method
    }));

    res.json({
      success: true,
      data: csvData,
      count: orders.length,
      message: "Export data ready"
    });
  } catch (error) {
    console.error("❌ Failed to export data:", error);
    res.status(500).json({
      success: false,
      error: "Failed to export data",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default supabaseRouter;