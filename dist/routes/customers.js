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
// src/routes/customers.ts - Customer Management Routes
const express_1 = __importDefault(require("express"));
const supabaseNormalized_1 = require("../database/supabaseNormalized");
const customersRouter = express_1.default.Router();
// ============================================================================
// CUSTOMERS ROUTES
// ============================================================================
// GET /api/customers - Get all customers with stats
customersRouter.get("/", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { limit = 100, offset = 0, search, customer_type, sort_by = 'created_at', sort_order = 'desc' } = req.query;
        let query = supabaseNormalized_1.supabase
            .from("customers")
            .select(`
        *,
        addresses (
          id,
          address_line_1,
          city,
          state,
          postcode,
          is_default
        ),
        orders (
          id,
          total_amount,
          order_date,
          status
        )
      `, { count: "exact" });
        // Apply filters
        if (search) {
            query = query.or(`customer_name.ilike.%${search}%,phone_number.ilike.%${search}%,fb_name.ilike.%${search}%,email.ilike.%${search}%`);
        }
        if (customer_type) {
            query = query.eq('customer_type', customer_type);
        }
        // Apply sorting
        const validSortFields = ['customer_name', 'created_at', 'last_order_date', 'total_spent'];
        const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
        query = query.order(sortField, { ascending: sort_order === 'asc' });
        // Apply pagination
        query = query.range(Number(offset), Number(offset) + Number(limit) - 1);
        const { data, error, count } = yield query;
        if (error) {
            console.error("❌ Failed to fetch customers:", error);
            throw error;
        }
        // Calculate customer stats
        const customersWithStats = (data === null || data === void 0 ? void 0 : data.map(customer => {
            const orders = customer.orders || [];
            const totalSpent = orders.reduce((sum, order) => sum + (order.total_amount || 0), 0);
            const totalOrders = orders.length;
            const lastOrderDate = orders.length > 0
                ? orders.sort((a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime())[0].order_date
                : null;
            return Object.assign(Object.assign({}, customer), { total_orders: totalOrders, total_spent: totalSpent, average_order_value: totalOrders > 0 ? totalSpent / totalOrders : 0, last_order_date: lastOrderDate });
        })) || [];
        res.json({
            success: true,
            data: customersWithStats,
            pagination: {
                offset: Number(offset),
                limit: Number(limit),
                total: count || 0
            }
        });
    }
    catch (error) {
        console.error("❌ Failed to fetch customers:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch customers",
            details: error instanceof Error ? error.message : String(error)
        });
    }
}));
// GET /api/customers/:id - Get single customer with full details
customersRouter.get("/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { data, error } = yield supabaseNormalized_1.supabase
            .from("customers")
            .select(`
        *,
        addresses (*),
        orders (
          *,
          order_items (
            *,
            products (product_name, product_code),
            packages (package_name, package_code)
          )
        )
      `)
            .eq("id", id)
            .single();
        if (error) {
            if (error.code === "PGRST116") {
                return res.status(404).json({
                    success: false,
                    error: "Customer not found"
                });
            }
            throw error;
        }
        // Calculate customer statistics
        const orders = data.orders || [];
        const totalSpent = orders.reduce((sum, order) => sum + (order.total_amount || 0), 0);
        const avgOrderValue = orders.length > 0 ? totalSpent / orders.length : 0;
        const lastOrderDate = orders.length > 0
            ? orders.sort((a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime())[0].order_date
            : null;
        const customerWithStats = Object.assign(Object.assign({}, data), { total_orders: orders.length, total_spent: totalSpent, average_order_value: avgOrderValue, last_order_date: lastOrderDate });
        res.json({
            success: true,
            data: customerWithStats
        });
    }
    catch (error) {
        console.error("❌ Failed to get customer:", error);
        res.status(500).json({
            success: false,
            error: "Failed to get customer",
            details: error instanceof Error ? error.message : String(error)
        });
    }
}));
// PUT /api/customers/:id - Update customer
customersRouter.put("/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const updates = req.body;
        // Add updated timestamp
        updates.updated_at = new Date().toISOString();
        const { data, error } = yield supabaseNormalized_1.supabase
            .from("customers")
            .update(updates)
            .eq("id", id)
            .select(`
        *,
        addresses (*),
        orders (id, total_amount, order_date, status)
      `)
            .single();
        if (error) {
            if (error.code === "PGRST116") {
                return res.status(404).json({
                    success: false,
                    error: "Customer not found"
                });
            }
            throw error;
        }
        res.json({
            success: true,
            data,
            message: "Customer updated successfully"
        });
    }
    catch (error) {
        console.error("❌ Failed to update customer:", error);
        res.status(500).json({
            success: false,
            error: "Failed to update customer",
            details: error instanceof Error ? error.message : String(error)
        });
    }
}));
// POST /api/customers/:id/addresses - Add address to customer
customersRouter.post("/:id/addresses", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const addressData = req.body;
        // Verify customer exists
        const { data: customer, error: customerError } = yield supabaseNormalized_1.supabase
            .from("customers")
            .select("id")
            .eq("id", id)
            .single();
        if (customerError || !customer) {
            return res.status(404).json({
                success: false,
                error: "Customer not found"
            });
        }
        // If this is set as default, unset other default addresses
        if (addressData.is_default) {
            yield supabaseNormalized_1.supabase
                .from('addresses')
                .update({ is_default: false })
                .eq('customer_id', id);
        }
        const { data, error } = yield supabaseNormalized_1.supabase
            .from("addresses")
            .insert(Object.assign(Object.assign({ customer_id: parseInt(id) }, addressData), { created_at: new Date().toISOString(), updated_at: new Date().toISOString() }))
            .select()
            .single();
        if (error) {
            console.error("❌ Failed to create address:", error);
            throw error;
        }
        res.status(201).json({
            success: true,
            data,
            message: "Address added successfully"
        });
    }
    catch (error) {
        console.error("❌ Failed to add address:", error);
        res.status(500).json({
            success: false,
            error: "Failed to add address",
            details: error instanceof Error ? error.message : String(error)
        });
    }
}));
// GET /api/customers/stats/overview - Customer statistics
customersRouter.get("/stats/overview", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { period = '30' } = req.query; // Days to look back
        const daysBack = parseInt(period);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysBack);
        // Get customer counts
        const { count: totalCustomers } = yield supabaseNormalized_1.supabase
            .from("customers")
            .select("*", { count: "exact", head: true });
        const { count: newCustomers } = yield supabaseNormalized_1.supabase
            .from("customers")
            .select("*", { count: "exact", head: true })
            .gte("created_at", cutoffDate.toISOString());
        const { count: repeatCustomers } = yield supabaseNormalized_1.supabase
            .from("customers")
            .select("*", { count: "exact", head: true })
            .eq("customer_type", "repeat");
        // Get order statistics for customer analysis
        const { data: customerOrders, error: ordersError } = yield supabaseNormalized_1.supabase
            .from("orders")
            .select("customer_id, total_amount")
            .gte("order_date", cutoffDate.toISOString());
        if (ordersError)
            throw ordersError;
        // Calculate average customer metrics
        const customerOrderCounts = (customerOrders === null || customerOrders === void 0 ? void 0 : customerOrders.reduce((acc, order) => {
            acc[order.customer_id] = (acc[order.customer_id] || 0) + 1;
            return acc;
        }, {})) || {};
        const customerSpending = (customerOrders === null || customerOrders === void 0 ? void 0 : customerOrders.reduce((acc, order) => {
            acc[order.customer_id] = (acc[order.customer_id] || 0) + (order.total_amount || 0);
            return acc;
        }, {})) || {};
        const avgOrdersPerCustomer = Object.keys(customerOrderCounts).length > 0
            ? Object.values(customerOrderCounts).reduce((sum, count) => sum + count, 0) / Object.keys(customerOrderCounts).length
            : 0;
        const avgSpendingPerCustomer = Object.keys(customerSpending).length > 0
            ? Object.values(customerSpending).reduce((sum, amount) => sum + amount, 0) / Object.keys(customerSpending).length
            : 0;
        res.json({
            success: true,
            data: {
                period: daysBack,
                customers: {
                    total: totalCustomers || 0,
                    new: newCustomers || 0,
                    repeat: repeatCustomers || 0,
                    newCustomerRate: (totalCustomers !== null && totalCustomers !== void 0 ? totalCustomers : 0) > 0 ? ((newCustomers || 0) / (totalCustomers !== null && totalCustomers !== void 0 ? totalCustomers : 0) * 100).toFixed(1) : 0
                },
                averages: {
                    ordersPerCustomer: parseFloat(avgOrdersPerCustomer.toFixed(2)),
                    spendingPerCustomer: parseFloat(avgSpendingPerCustomer.toFixed(2))
                },
                activeCustomers: Object.keys(customerOrderCounts).length
            }
        });
    }
    catch (error) {
        console.error("❌ Failed to get customer stats:", error);
        res.status(500).json({
            success: false,
            error: "Failed to get customer stats",
            details: error instanceof Error ? error.message : String(error)
        });
    }
}));
// GET /api/customers/search/phone/:phone - Search customer by phone
customersRouter.get("/search/phone/:phone", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { phone } = req.params;
        const { data, error } = yield supabaseNormalized_1.supabase
            .from("customers")
            .select(`
        *,
        addresses (*),
        orders (
          id,
          order_number,
          total_amount,
          order_date,
          status
        )
      `)
            .eq("phone_number", phone)
            .single();
        if (error) {
            if (error.code === "PGRST116") {
                return res.status(404).json({
                    success: false,
                    error: "Customer not found"
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
        console.error("❌ Failed to search customer:", error);
        res.status(500).json({
            success: false,
            error: "Failed to search customer",
            details: error instanceof Error ? error.message : String(error)
        });
    }
}));
exports.default = customersRouter;
