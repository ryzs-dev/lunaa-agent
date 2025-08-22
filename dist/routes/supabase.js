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
const supabaseOrders_1 = require("../database/supabaseOrders");
const supabaseRouter = express_1.default.Router();
// GET /api/supabase/orders - Fetch orders from Supabase with filters
supabaseRouter.get("/orders", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { limit = 100, offset = 0, startDate, endDate, status, currency, month // For processing specific months like August
         } = req.query;
        let query = supabaseOrders_1.supabase
            .from("orders")
            .select("*", { count: "exact" })
            .order("created_at", { ascending: false });
        // Apply filters
        if (startDate) {
            query = query.gte("order_date", startDate);
        }
        if (endDate) {
            query = query.lte("order_date", endDate);
        }
        if (status) {
            query = query.eq("status", status);
        }
        if (currency) {
            query = query.eq("currency", currency);
        }
        // Filter by specific month (useful for August processing)
        if (month) {
            const year = new Date().getFullYear();
            const monthStart = new Date(year, parseInt(month) - 1, 1).toISOString();
            const monthEnd = new Date(year, parseInt(month), 0, 23, 59, 59).toISOString();
            query = query.gte("order_date", monthStart).lte("order_date", monthEnd);
        }
        // Apply pagination
        query = query.range(Number(offset), Number(offset) + Number(limit) - 1);
        const { data, error, count } = yield query;
        if (error) {
            console.error("❌ Supabase query error:", error);
            throw error;
        }
        res.json({
            success: true,
            data: data || [],
            pagination: {
                offset: Number(offset),
                limit: Number(limit),
                total: count || 0
            }
        });
    }
    catch (error) {
        console.error("❌ Failed to fetch orders:", error);
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
        const order = req.body;
        // Validate required fields
        if (!order.customer_name && !order.phone_number) {
            return res.status(400).json({
                success: false,
                error: "Either customer_name or phone_number is required"
            });
        }
        const orderId = yield (0, supabaseOrders_1.insertOrder)(order);
        res.json({
            success: true,
            data: { id: orderId },
            message: "Order inserted successfully"
        });
    }
    catch (error) {
        console.error("❌ Failed to insert order:", error);
        res.status(500).json({
            success: false,
            error: "Failed to insert order",
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
        // Process in batches to avoid overwhelming the database
        const batches = [];
        for (let i = 0; i < orders.length; i += batchSize) {
            batches.push(orders.slice(i, i + batchSize));
        }
        let successCount = 0;
        let errorCount = 0;
        const errors = [];
        for (let i = 0; i < batches.length; i++) {
            try {
                console.log(`📦 Processing batch ${i + 1}/${batches.length} (${batches[i].length} orders)...`);
                yield (0, supabaseOrders_1.bulkInsertOrders)(batches[i]);
                successCount += batches[i].length;
                console.log(`✅ Batch ${i + 1} completed successfully`);
            }
            catch (error) {
                console.error(`❌ Batch ${i + 1} failed:`, error);
                errorCount += batches[i].length;
                errors.push({
                    batch: i + 1,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
        res.json({
            success: true,
            data: {
                totalProcessed: orders.length,
                successCount,
                errorCount,
                errors: errors.length > 0 ? errors : undefined
            },
            message: `Bulk insert completed. Success: ${successCount}, Errors: ${errorCount}`
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
        // Build date filter
        let dateFilter = "";
        if (month) {
            const year = new Date().getFullYear();
            const monthStart = new Date(year, parseInt(month) - 1, 1).toISOString();
            const monthEnd = new Date(year, parseInt(month), 0, 23, 59, 59).toISOString();
            dateFilter = `and(order_date.gte.${monthStart},order_date.lte.${monthEnd})`;
        }
        else if (startDate && endDate) {
            dateFilter = `and(created_at.gte.${startDate},created_at.lte.${endDate})`;
        }
        else if (startDate) {
            dateFilter = `created_at.gte.${startDate}`;
        }
        else if (endDate) {
            dateFilter = `created_at.lte.${endDate}`;
        }
        // Get orders with filters
        let ordersQuery = supabaseOrders_1.supabase
            .from("orders")
            .select("total_paid, currency, created_at, order_date");
        if (dateFilter) {
            if (month) {
                const year = new Date().getFullYear();
                const monthStart = new Date(year, parseInt(month) - 1, 1).toISOString();
                const monthEnd = new Date(year, parseInt(month), 0, 23, 59, 59).toISOString();
                ordersQuery = ordersQuery.gte("order_date", monthStart).lte("order_date", monthEnd);
            }
            else {
                if (startDate)
                    ordersQuery = ordersQuery.gte("created_at", startDate);
                if (endDate)
                    ordersQuery = ordersQuery.lte("created_at", endDate);
            }
        }
        const { data: orders, error: ordersError } = yield ordersQuery;
        if (ordersError)
            throw ordersError;
        // Get message stats
        const { data: messages, error: messagesError } = yield supabaseOrders_1.supabase
            .from("messages")
            .select("latest_status");
        if (messagesError)
            throw messagesError;
        // Get conversations count
        const { count: conversationsCount, error: conversationsError } = yield supabaseOrders_1.supabase
            .from("conversations")
            .select("*", { count: "exact", head: true });
        if (conversationsError)
            throw conversationsError;
        // Calculate order stats
        const totalOrders = (orders === null || orders === void 0 ? void 0 : orders.length) || 0;
        const totalRevenue = (orders === null || orders === void 0 ? void 0 : orders.reduce((sum, order) => sum + (order.total_paid || 0), 0)) || 0;
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
        // Group revenue by currency
        const revenueByCurrency = (orders === null || orders === void 0 ? void 0 : orders.reduce((acc, order) => {
            const currency = order.currency || "MYR";
            acc[currency] = (acc[currency] || 0) + (order.total_paid || 0);
            return acc;
        }, {})) || {};
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
                    total: totalOrders,
                    revenue: totalRevenue,
                    avgOrderValue,
                    revenueByCurrency
                },
                messages: messageStats,
                conversations: {
                    total: conversationsCount || 0
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
        let query = supabaseOrders_1.supabase.from("orders").select("*");
        if (q) {
            // Search across multiple fields
            query = query.or(`customer_name.ilike.%${q}%,phone_number.ilike.%${q}%,tracking_number.ilike.%${q}%,fb_name.ilike.%${q}%`);
        }
        if (phone) {
            query = query.eq("phone_number", phone);
        }
        if (trackingNumber) {
            query = query.eq("tracking_number", trackingNumber);
        }
        if (customerName) {
            query = query.ilike("customer_name", `%${customerName}%`);
        }
        const { data, error } = yield query
            .order("created_at", { ascending: false })
            .limit(Number(limit));
        if (error)
            throw error;
        res.json({
            success: true,
            data: data || [],
            count: (data === null || data === void 0 ? void 0 : data.length) || 0
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
        const { data, error } = yield supabaseOrders_1.supabase
            .from("orders")
            .select("*")
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
        const { data, error } = yield supabaseOrders_1.supabase
            .from("orders")
            .update(updates)
            .eq("id", id)
            .select()
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
        const { error } = yield supabaseOrders_1.supabase
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
// POST /api/supabase/sync/august - Special endpoint for August data migration
supabaseRouter.post("/sync/august", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data: augustData } = req.body;
        if (!Array.isArray(augustData)) {
            return res.status(400).json({
                success: false,
                error: "August data must be an array"
            });
        }
        console.log(`📅 Starting August data sync for ${augustData.length} records...`);
        // Transform the data to match your Order interface
        const transformedOrders = augustData.map((row) => ({
            order_date: row.order_date ? new Date(row.order_date).toISOString() : new Date().toISOString(),
            customer_name: row.customer_name || row.name || row.fb_name,
            phone_number: row.phone_number || row.phone,
            total_paid: parseFloat(row.total_paid || row.total || 0),
            currency: row.currency || "MYR",
            payment_method: row.payment_method || row.paymentMethod,
            wash_qty: parseInt(row.wash_qty || row.wash120ml || 0),
            femlift_30ml_qty: parseInt(row.femlift_30ml_qty || row.femlift30ml || 0),
            femlift_10ml_qty: parseInt(row.femlift_10ml_qty || row.femlift10ml || 0),
            wash_30ml_qty: parseInt(row.wash_30ml_qty || row.wash30ml || 0),
            spray_qty: parseInt(row.spray_qty || row.spray || 0),
            tracking_number: row.tracking_number || row.trackingNumber,
            courier_company: row.courier_company || row.courierCompany,
            status: row.status || "completed",
            new_or_repeat: row.new_or_repeat || row.customerType === "new" ? "new" : "repeat",
            agent_name: row.agent_name || row.agent,
            remark: row.remark,
            package_price: parseFloat(row.package_price || row.packageAmount || 0),
            postage: parseFloat(row.postage || 0),
            cash_sale_receipt: row.cash_sale_receipt || row.cashSaleReceipt,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }));
        // Use bulk insert
        const result = yield (0, supabaseOrders_1.bulkInsertOrders)(transformedOrders);
        res.json({
            success: true,
            data: {
                processed: augustData.length,
                inserted: transformedOrders.length,
                result
            },
            message: `Successfully synced ${transformedOrders.length} August orders`
        });
    }
    catch (error) {
        console.error("❌ Failed to sync August data:", error);
        res.status(500).json({
            success: false,
            error: "Failed to sync August data",
            details: error instanceof Error ? error.message : String(error)
        });
    }
}));
// GET /api/supabase/health - Health check for Supabase connection
supabaseRouter.get("/health", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data, error } = yield supabaseOrders_1.supabase
            .from("orders")
            .select("id")
            .limit(1);
        if (error)
            throw error;
        res.json({
            success: true,
            data: {
                status: "healthy",
                timestamp: new Date().toISOString(),
                connection: "active"
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
        let query = supabaseOrders_1.supabase.from("orders").select("*").order("order_date", { ascending: false });
        // Apply date filters
        if (month) {
            const year = new Date().getFullYear();
            const monthStart = new Date(year, parseInt(month) - 1, 1).toISOString();
            const monthEnd = new Date(year, parseInt(month), 0, 23, 59, 59).toISOString();
            query = query.gte("order_date", monthStart).lte("order_date", monthEnd);
        }
        else {
            if (startDate)
                query = query.gte("order_date", startDate);
            if (endDate)
                query = query.lte("order_date", endDate);
        }
        const { data, error } = yield query;
        if (error)
            throw error;
        // Here you would use a library like xlsx to create Excel file
        // For now, return CSV data
        const csvData = data === null || data === void 0 ? void 0 : data.map(order => ({
            "Order ID": order.id,
            "Date": order.order_date,
            "Customer": order.customer_name,
            "Phone": order.phone_number,
            "Amount": order.total_paid,
            "Currency": order.currency,
            "Status": order.status,
            "Tracking": order.tracking_number
        }));
        res.json({
            success: true,
            data: csvData,
            count: (data === null || data === void 0 ? void 0 : data.length) || 0,
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
