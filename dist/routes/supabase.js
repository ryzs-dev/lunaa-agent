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
const express_1 = __importDefault(require("express"));
const supabaseNormalized_1 = require("../database/supabaseNormalized"); // ✅ FIXED: Using normalized schema
const supabaseOrders_1 = require("../database/supabaseOrders");
const supabaseRouter = express_1.default.Router();
// GET /api/supabase/orders - Fetch orders from Supabase with filters
supabaseRouter.get("/orders", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { limit = 100, offset = 0, startDate, endDate, status, currency, month // For processing specific months like August
         } = req.query;
        // Use the searchOrders function from normalized schema
        const searchQuery = {
            limit: Number(limit),
            offset: Number(offset)
        };
        if (startDate)
            searchQuery.startDate = startDate;
        if (endDate)
            searchQuery.endDate = endDate;
        if (status)
            searchQuery.status = status;
        // Handle month filtering
        if (month) {
            const year = new Date().getFullYear();
            const monthStart = new Date(year, parseInt(month) - 1, 1).toISOString();
            const monthEnd = new Date(year, parseInt(month), 0, 23, 59, 59).toISOString();
            searchQuery.startDate = monthStart;
            searchQuery.endDate = monthEnd;
        }
        const { orders, totalCount } = yield (0, supabaseNormalized_1.searchOrders)(searchQuery);
        res.json({
            success: true,
            data: orders,
            pagination: {
                offset: Number(offset),
                limit: Number(limit),
                total: totalCount
            }
        });
    }
    catch (error) {
        console.error("❌ Supabase query error:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch orders",
            details: error instanceof Error ? error.message : String(error)
        });
    }
}));
// POST /api/supabase/orders - Insert single order
supabaseRouter.post("/orders", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const orderData = req.body;
        // Validate required fields for normalized schema
        if (!orderData.customer_name && !orderData.phone_number) {
            return res.status(400).json({
                success: false,
                error: "Either customer_name or phone_number is required"
            });
        }
        // Validate required address fields if address is provided
        if (orderData.address_line_1 && !orderData.city) {
            return res.status(400).json({
                success: false,
                error: "City is required when address is provided"
            });
        }
        // Use createSimpleOrder from normalized schema with updated fields
        const order = yield (0, supabaseNormalized_1.createSimpleOrder)({
            customer_name: orderData.customer_name || 'Unknown',
            phone_number: orderData.phone_number,
            fb_name: orderData.fb_name,
            total_amount: orderData.total_amount || 0,
            payment_method: orderData.payment_method || 'cash',
            payment_status: orderData.payment_status || 'pending',
            source: orderData.source || 'api',
            agent_name: orderData.agent_name || 'System',
            notes: orderData.notes,
            // Updated address fields to match new schema
            address_line_1: orderData.address_line_1 || orderData.address, // Fallback for old API
            address_line_2: orderData.address_line_2,
            city: orderData.city,
            postcode: orderData.postcode,
            state: orderData.state,
            country: orderData.country || 'Malaysia',
            // Add additional order fields
            subtotal: orderData.subtotal || orderData.total_amount || 0,
            postage: orderData.postage || 0,
            website_charges: orderData.website_charges || 0,
            currency: orderData.currency || 'MYR'
        });
        res.json({
            success: true,
            data: {
                id: order.id,
                order_number: order.order_number,
                customer_id: order.customer_id,
                total_amount: order.total_amount
            },
            message: "Order created successfully"
        });
    }
    catch (error) {
        console.error("❌ Failed to create order:", error);
        // Handle specific database errors
        if (error instanceof Error) {
            // Handle duplicate order number error specifically
            if (error.message.includes('duplicate key value violates unique constraint "orders_order_number_key"')) {
                return res.status(409).json({
                    success: false,
                    error: "Order number conflict",
                    details: "A duplicate order number was generated. Please try again.",
                    code: "DUPLICATE_ORDER_NUMBER"
                });
            }
            // Handle other constraint violations
            if (error.message.includes('violates') && error.message.includes('constraint')) {
                return res.status(400).json({
                    success: false,
                    error: "Data validation error",
                    details: error.message,
                    code: "CONSTRAINT_VIOLATION"
                });
            }
        }
        res.status(500).json({
            success: false,
            error: "Failed to create order",
            details: error instanceof Error ? error.message : String(error)
        });
    }
}));
// POST /api/supabase/orders/bulk - Bulk insert orders (for data migration)
supabaseRouter.post("/orders/bulk", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { orders, batchSize = 100 } = req.body;
        if (!Array.isArray(orders) || orders.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Orders array is required and cannot be empty"
            });
        }
        console.log(`📊 Starting bulk insert of ${orders.length} orders...`);
        // Transform orders to match normalized schema
        const transformedOrders = orders.map((order) => ({
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
        yield (0, supabaseOrders_1.bulkInsertOrders)(transformedOrders);
        res.json({
            success: true,
            data: {
                totalProcessed: orders.length,
                successCount: orders.length,
                errorCount: 0
            },
            message: `Bulk insert completed successfully`
        });
    }
    catch (error) {
        console.error("❌ Failed to bulk insert orders:", error);
        res.status(500).json({
            success: false,
            error: "Failed to bulk insert orders",
            details: error instanceof Error ? error.message : String(error)
        });
    }
}));
// GET /api/supabase/dashboard-stats - Dashboard statistics from Supabase
supabaseRouter.get("/dashboard-stats", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { startDate, endDate, month } = req.query;
        // Build filters for normalized schema
        const filters = {};
        if (month) {
            const year = new Date().getFullYear();
            const monthStart = new Date(year, parseInt(month) - 1, 1).toISOString();
            const monthEnd = new Date(year, parseInt(month), 0, 23, 59, 59).toISOString();
            filters.startDate = monthStart;
            filters.endDate = monthEnd;
        }
        else {
            if (startDate)
                filters.startDate = startDate;
            if (endDate)
                filters.endDate = endDate;
        }
        // Use normalized schema dashboard stats function
        const stats = yield (0, supabaseNormalized_1.getDashboardStats)(filters);
        // Get message stats (keeping existing logic)
        const { data: messages, error: messagesError } = yield supabaseNormalized_1.supabase
            .from("messages")
            .select("latest_status");
        if (messagesError)
            throw messagesError;
        // Get conversations count
        const { count: conversationsCount, error: conversationsError } = yield supabaseNormalized_1.supabase
            .from("conversations")
            .select("*", { count: "exact", head: true });
        if (conversationsError)
            throw conversationsError;
        // Calculate message stats
        const messageStats = {
            total: (messages === null || messages === void 0 ? void 0 : messages.length) || 0,
            delivered: (messages === null || messages === void 0 ? void 0 : messages.filter(m => m.latest_status === "delivered").length) || 0,
            failed: (messages === null || messages === void 0 ? void 0 : messages.filter(m => m.latest_status === "failed").length) || 0,
            pending: (messages === null || messages === void 0 ? void 0 : messages.filter(m => ["queued", "sending", "sent"].includes(m.latest_status)).length) || 0
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
    }
    catch (error) {
        console.error("❌ Failed to get dashboard stats:", error);
        res.status(500).json({
            success: false,
            error: "Failed to get dashboard stats",
            details: error instanceof Error ? error.message : String(error)
        });
    }
}));
// GET /api/supabase/orders/search - Search orders
supabaseRouter.get("/orders/search", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { q, // general search query
        phone, trackingNumber, customerName, limit = 50 } = req.query;
        // Use normalized schema search function
        const searchQuery = {
            limit: Number(limit)
        };
        if (q)
            searchQuery.searchTerm = q;
        // ✅ FIXED: Use normalized schema search which handles customer joins properly
        const { orders, totalCount } = yield (0, supabaseNormalized_1.searchOrders)(searchQuery);
        // Additional filtering for specific fields (since normalized search might not cover all)
        let filteredOrders = orders;
        if (phone && !q) {
            filteredOrders = orders.filter((order) => { var _a; return ((_a = order.customers) === null || _a === void 0 ? void 0 : _a.phone_number) === phone; });
        }
        if (trackingNumber && !q) {
            filteredOrders = orders.filter((order) => order.tracking_number === trackingNumber);
        }
        if (customerName && !q) {
            filteredOrders = orders.filter((order) => { var _a, _b; return (_b = (_a = order.customers) === null || _a === void 0 ? void 0 : _a.customer_name) === null || _b === void 0 ? void 0 : _b.toLowerCase().includes(customerName.toLowerCase()); });
        }
        res.json({
            success: true,
            data: filteredOrders,
            count: filteredOrders.length
        });
    }
    catch (error) {
        console.error("❌ Failed to search orders:", error);
        res.status(500).json({
            success: false,
            error: "Failed to search orders",
            details: error instanceof Error ? error.message : String(error)
        });
    }
}));
// GET /api/supabase/orders/:id - Get single order by ID
supabaseRouter.get("/orders/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // ✅ FIXED: Query with customer join for normalized schema
        const { data, error } = yield supabaseNormalized_1.supabase
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
    }
    catch (error) {
        console.error("❌ Failed to get order:", error);
        res.status(500).json({
            success: false,
            error: "Failed to get order",
            details: error instanceof Error ? error.message : String(error)
        });
    }
}));
// PUT /api/supabase/orders/:id - Update order
supabaseRouter.put("/orders/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const updates = req.body;
        // Add updated timestamp
        updates.updated_at = new Date().toISOString();
        const { data, error } = yield supabaseNormalized_1.supabase
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
    }
    catch (error) {
        console.error("❌ Failed to update order:", error);
        res.status(500).json({
            success: false,
            error: "Failed to update order",
            details: error instanceof Error ? error.message : String(error)
        });
    }
}));
// DELETE /api/supabase/orders/:id - Delete order
supabaseRouter.delete("/orders/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { error } = yield supabaseNormalized_1.supabase
            .from("orders")
            .delete()
            .eq("id", id);
        if (error)
            throw error;
        res.json({
            success: true,
            message: "Order deleted successfully"
        });
    }
    catch (error) {
        console.error("❌ Failed to delete order:", error);
        res.status(500).json({
            success: false,
            error: "Failed to delete order",
            details: error instanceof Error ? error.message : String(error)
        });
    }
}));
// GET /api/supabase/health - Health check for Supabase connection
supabaseRouter.get("/health", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // ✅ FIXED: Test both orders and customers tables for normalized schema
        const { data: ordersData, error: ordersError } = yield supabaseNormalized_1.supabase
            .from("orders")
            .select("id")
            .limit(1);
        const { data: customersData, error: customersError } = yield supabaseNormalized_1.supabase
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
    }
    catch (error) {
        console.error("❌ Supabase health check failed:", error);
        res.status(500).json({
            success: false,
            error: "Supabase connection failed",
            details: error instanceof Error ? error.message : String(error)
        });
    }
}));
// GET /api/supabase/export/excel - Export orders to Excel
supabaseRouter.get("/export/excel", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { startDate, endDate, month } = req.query;
        // Use normalized schema search for export
        const searchQuery = {};
        if (month) {
            const year = new Date().getFullYear();
            const monthStart = new Date(year, parseInt(month) - 1, 1).toISOString();
            const monthEnd = new Date(year, parseInt(month), 0, 23, 59, 59).toISOString();
            searchQuery.startDate = monthStart;
            searchQuery.endDate = monthEnd;
        }
        else {
            if (startDate)
                searchQuery.startDate = startDate;
            if (endDate)
                searchQuery.endDate = endDate;
        }
        const { orders } = yield (0, supabaseNormalized_1.searchOrders)(searchQuery);
        // ✅ FIXED: Map normalized schema fields for export
        const csvData = orders.map((order) => {
            var _a, _b;
            return ({
                "Order ID": order.id,
                "Order Number": order.order_number,
                "Date": order.order_date,
                "Customer": (_a = order.customers) === null || _a === void 0 ? void 0 : _a.customer_name,
                "Phone": (_b = order.customers) === null || _b === void 0 ? void 0 : _b.phone_number,
                "Amount": order.total_amount, // ✅ FIXED: total_amount not total_paid
                "Currency": order.currency,
                "Status": order.status,
                "Tracking": order.tracking_number,
                "Agent": order.agent_name,
                "Payment Method": order.payment_method
            });
        });
        res.json({
            success: true,
            data: csvData,
            count: orders.length,
            message: "Export data ready"
        });
    }
    catch (error) {
        console.error("❌ Failed to export data:", error);
        res.status(500).json({
            success: false,
            error: "Failed to export data",
            details: error instanceof Error ? error.message : String(error)
        });
    }
}));
exports.default = supabaseRouter;
