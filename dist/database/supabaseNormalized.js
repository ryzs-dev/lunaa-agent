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
exports.supabase = void 0;
exports.upsertCustomer = upsertCustomer;
exports.getCustomerByPhone = getCustomerByPhone;
exports.getCustomerWithAddresses = getCustomerWithAddresses;
exports.upsertAddress = upsertAddress;
exports.getCustomerAddresses = getCustomerAddresses;
exports.getProducts = getProducts;
exports.getProductByCode = getProductByCode;
exports.createProduct = createProduct;
exports.updateProduct = updateProduct;
exports.deleteProduct = deleteProduct;
exports.getPackages = getPackages;
exports.getPackageByCode = getPackageByCode;
exports.createPackage = createPackage;
exports.updatePackage = updatePackage;
exports.deletePackage = deletePackage;
exports.createSimpleOrder = createSimpleOrder;
exports.getRecentOrders = getRecentOrders;
exports.searchOrders = searchOrders;
exports.getDashboardStats = getDashboardStats;
exports.addOrderItem = addOrderItem;
exports.getOrderItems = getOrderItems;
exports.updateOrderItem = updateOrderItem;
exports.deleteOrderItem = deleteOrderItem;
exports.createOrderWithItems = createOrderWithItems;
exports.insertMessage = insertMessage;
exports.upsertConversation = upsertConversation;
exports.testNormalizedConnection = testNormalizedConnection;
exports.insertOrder = insertOrder;
exports.bulkInsertOrders = bulkInsertOrders;
// src/database/supabaseNormalized.ts - Complete version with all CRUD operations
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const supabase_js_1 = require("@supabase/supabase-js");
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../.env.local") });
// Supabase Client Initialization
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
exports.supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
// ============================================================================
// CUSTOMER FUNCTIONS
// ============================================================================
function upsertCustomer(customerData) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { data, error } = yield exports.supabase
                .from("customers")
                .upsert(Object.assign(Object.assign({}, customerData), { updated_at: new Date().toISOString() }), {
                onConflict: "phone_number",
                ignoreDuplicates: false,
            })
                .select()
                .single();
            if (error) {
                console.error("❌ Failed to upsert customer:", error);
                throw error;
            }
            return data;
        }
        catch (error) {
            console.error("❌ Error in upsertCustomer:", error);
            throw error;
        }
    });
}
function getCustomerByPhone(phoneNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { data, error } = yield exports.supabase
                .from("customers")
                .select("*")
                .eq("phone_number", phoneNumber)
                .maybeSingle();
            if (error) {
                console.error("❌ Failed to get customer:", error);
                throw error;
            }
            return data;
        }
        catch (error) {
            console.error("❌ Error in getCustomerByPhone:", error);
            throw error;
        }
    });
}
function getCustomerWithAddresses(customerId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { data, error } = yield exports.supabase
                .from("customers")
                .select(`
        *,
        addresses (*)
      `)
                .eq("id", customerId)
                .maybeSingle();
            if (error) {
                console.error("❌ Failed to get customer with addresses:", error);
                throw error;
            }
            return data;
        }
        catch (error) {
            console.error("❌ Error in getCustomerWithAddresses:", error);
            throw error;
        }
    });
}
// ============================================================================
// ADDRESS FUNCTIONS
// ============================================================================
function upsertAddress(addressData) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (addressData.is_default) {
                yield exports.supabase
                    .from("addresses")
                    .update({ is_default: false })
                    .eq("customer_id", addressData.customer_id);
            }
            const { data, error } = yield exports.supabase
                .from("addresses")
                .insert(Object.assign(Object.assign({}, addressData), { created_at: new Date().toISOString(), updated_at: new Date().toISOString() }))
                .select()
                .single();
            if (error) {
                console.error("❌ Failed to insert address:", error);
                throw error;
            }
            return data;
        }
        catch (error) {
            console.error("❌ Error in upsertAddress:", error);
            throw error;
        }
    });
}
function getCustomerAddresses(customerId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { data, error } = yield exports.supabase
                .from("addresses")
                .select("*")
                .eq("customer_id", customerId)
                .order("is_default", { ascending: false });
            if (error) {
                console.error("❌ Failed to get customer addresses:", error);
                throw error;
            }
            return data || [];
        }
        catch (error) {
            console.error("❌ Error in getCustomerAddresses:", error);
            return [];
        }
    });
}
// ============================================================================
// PRODUCT FUNCTIONS
// ============================================================================
function getProducts() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { data, error } = yield exports.supabase
                .from("products")
                .select("*")
                .eq("is_active", true)
                .order("product_name");
            if (error) {
                console.error("❌ Failed to get products:", error);
                throw error;
            }
            return data || [];
        }
        catch (error) {
            console.error("❌ Error in getProducts:", error);
            return [];
        }
    });
}
function getProductByCode(productCode) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { data, error } = yield exports.supabase
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
        }
        catch (error) {
            console.error("❌ Error in getProductByCode:", error);
            return null;
        }
    });
}
function createProduct(productData) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const { data, error } = yield exports.supabase
                .from("products")
                .insert(Object.assign(Object.assign({}, productData), { is_active: (_a = productData.is_active) !== null && _a !== void 0 ? _a : true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }))
                .select()
                .single();
            if (error) {
                console.error("❌ Failed to create product:", error);
                throw error;
            }
            return data;
        }
        catch (error) {
            console.error("❌ Error in createProduct:", error);
            throw error;
        }
    });
}
function updateProduct(productId, updates) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { data, error } = yield exports.supabase
                .from("products")
                .update(Object.assign(Object.assign({}, updates), { updated_at: new Date().toISOString() }))
                .eq("id", productId)
                .select()
                .single();
            if (error) {
                console.error("❌ Failed to update product:", error);
                throw error;
            }
            return data;
        }
        catch (error) {
            console.error("❌ Error in updateProduct:", error);
            throw error;
        }
    });
}
function deleteProduct(productId_1) {
    return __awaiter(this, arguments, void 0, function* (productId, hardDelete = false) {
        try {
            if (hardDelete) {
                const { error } = yield exports.supabase
                    .from("products")
                    .delete()
                    .eq("id", productId);
                if (error)
                    throw error;
            }
            else {
                const { error } = yield exports.supabase
                    .from("products")
                    .update({
                    is_active: false,
                    updated_at: new Date().toISOString(),
                })
                    .eq("id", productId);
                if (error)
                    throw error;
            }
        }
        catch (error) {
            console.error("❌ Error in deleteProduct:", error);
            throw error;
        }
    });
}
// ============================================================================
// PACKAGE FUNCTIONS
// ============================================================================
function getPackages() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { data, error } = yield exports.supabase
                .from("packages")
                .select("*")
                .eq("is_active", true)
                .order("package_name");
            if (error) {
                console.error("❌ Failed to get packages:", error);
                throw error;
            }
            return data || [];
        }
        catch (error) {
            console.error("❌ Error in getPackages:", error);
            return [];
        }
    });
}
function getPackageByCode(packageCode) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { data, error } = yield exports.supabase
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
        }
        catch (error) {
            console.error("❌ Error in getPackageByCode:", error);
            return null;
        }
    });
}
function createPackage(packageData) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const { data, error } = yield exports.supabase
                .from("packages")
                .insert(Object.assign(Object.assign({}, packageData), { is_active: (_a = packageData.is_active) !== null && _a !== void 0 ? _a : true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }))
                .select()
                .single();
            if (error) {
                console.error("❌ Failed to create package:", error);
                throw error;
            }
            return data;
        }
        catch (error) {
            console.error("❌ Error in createPackage:", error);
            throw error;
        }
    });
}
function updatePackage(packageId, updates) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { data, error } = yield exports.supabase
                .from("packages")
                .update(Object.assign(Object.assign({}, updates), { updated_at: new Date().toISOString() }))
                .eq("id", packageId)
                .select()
                .single();
            if (error) {
                console.error("❌ Failed to update package:", error);
                throw error;
            }
            return data;
        }
        catch (error) {
            console.error("❌ Error in updatePackage:", error);
            throw error;
        }
    });
}
function deletePackage(packageId_1) {
    return __awaiter(this, arguments, void 0, function* (packageId, hardDelete = false) {
        try {
            if (hardDelete) {
                const { error } = yield exports.supabase
                    .from("packages")
                    .delete()
                    .eq("id", packageId);
                if (error)
                    throw error;
            }
            else {
                const { error } = yield exports.supabase
                    .from("packages")
                    .update({
                    is_active: false,
                    updated_at: new Date().toISOString(),
                })
                    .eq("id", packageId);
                if (error)
                    throw error;
            }
        }
        catch (error) {
            console.error("❌ Error in deletePackage:", error);
            throw error;
        }
    });
}
// ============================================================================
// ORDER FUNCTIONS
// ============================================================================
function createSimpleOrder(orderData) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const customer = yield upsertCustomer({
                customer_name: orderData.customer_name,
                phone_number: orderData.phone_number,
                fb_name: orderData.fb_name,
                customer_type: "new",
            });
            let addressId;
            if (orderData.address) {
                try {
                    const address = yield upsertAddress({
                        customer_id: customer.id,
                        address_line_1: orderData.address,
                        city: orderData.city,
                        postcode: orderData.postcode,
                        state: orderData.state,
                        address_type: "shipping",
                        is_default: true,
                    });
                    addressId = address.id;
                }
                catch (addressError) {
                    console.log("⚠️ Could not create address, continuing without it:", addressError);
                }
            }
            const orderNumber = yield generateOrderNumber();
            const { data: order, error: orderError } = yield exports.supabase
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
        }
        catch (error) {
            console.error("❌ Error in createSimpleOrder:", error);
            throw error;
        }
    });
}
function generateOrderNumber() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const date = new Date();
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const { count } = yield exports.supabase
                .from("orders")
                .select("*", { count: "exact", head: true })
                .gte("created_at", `${year}-${month}-01`)
                .lt("created_at", `${year}-${month === "12" ? year + 1 : year}-${month === "12" ? "01" : String(parseInt(month) + 1).padStart(2, "0")}-01`);
            const sequence = String((count || 0) + 1).padStart(4, "0");
            return `ORD-${year}${month}-${sequence}`;
        }
        catch (error) {
            console.error("❌ Error generating order number:", error);
            return `ORD-${Date.now()}`;
        }
    });
}
function getRecentOrders() {
    return __awaiter(this, arguments, void 0, function* (limit = 50) {
        try {
            const { data, error } = yield exports.supabase
                .from("orders")
                .select(`
        *,
        customers (
          customer_name,
          phone_number,
          fb_name
        )
      `)
                .order("order_date", { ascending: false })
                .limit(limit);
            if (error) {
                console.error("❌ Failed to get recent orders:", error);
                throw error;
            }
            return data || [];
        }
        catch (error) {
            console.error("❌ Error in getRecentOrders:", error);
            return [];
        }
    });
}
function searchOrders(query) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            let orderQuery = exports.supabase.from("orders").select(`
        *,
        customers (
          customer_name,
          phone_number,
          fb_name
        )
      `, { count: "exact" });
            if (query.searchTerm) {
                orderQuery = orderQuery.or(`order_number.ilike.%${query.searchTerm}%,tracking_number.ilike.%${query.searchTerm}%`);
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
                orderQuery = orderQuery.range(query.offset, query.offset + query.limit - 1);
            }
            else if (query.limit) {
                orderQuery = orderQuery.limit(query.limit);
            }
            orderQuery = orderQuery.order("order_date", { ascending: false });
            const { data, error, count } = yield orderQuery;
            if (error) {
                console.error("❌ Failed to search orders:", error);
                throw error;
            }
            return {
                orders: data || [],
                totalCount: count || 0,
            };
        }
        catch (error) {
            console.error("❌ Error in searchOrders:", error);
            return { orders: [], totalCount: 0 };
        }
    });
}
function getDashboardStats(filters) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            let orderQuery = exports.supabase
                .from("orders")
                .select("total_amount, currency, customer_id, status, order_date");
            if (filters === null || filters === void 0 ? void 0 : filters.startDate) {
                orderQuery = orderQuery.gte("order_date", filters.startDate);
            }
            if (filters === null || filters === void 0 ? void 0 : filters.endDate) {
                orderQuery = orderQuery.lte("order_date", filters.endDate);
            }
            if (filters === null || filters === void 0 ? void 0 : filters.customerId) {
                orderQuery = orderQuery.eq("customer_id", filters.customerId);
            }
            const { data: orders, error: ordersError } = yield orderQuery;
            if (ordersError)
                throw ordersError;
            const { count: customersCount, error: customersError } = yield exports.supabase
                .from("customers")
                .select("*", { count: "exact", head: true });
            if (customersError)
                throw customersError;
            const totalOrders = (orders === null || orders === void 0 ? void 0 : orders.length) || 0;
            const totalRevenue = (orders === null || orders === void 0 ? void 0 : orders.reduce((sum, order) => sum + (order.total_amount || 0), 0)) || 0;
            const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
            return {
                totalOrders,
                totalRevenue,
                avgOrderValue,
                totalCustomers: customersCount || 0,
                ordersByStatus: (orders === null || orders === void 0 ? void 0 : orders.reduce((acc, order) => {
                    acc[order.status || "unknown"] =
                        (acc[order.status || "unknown"] || 0) + 1;
                    return acc;
                }, {})) || {},
            };
        }
        catch (error) {
            console.error("❌ Error in getDashboardStats:", error);
            return {
                totalOrders: 0,
                totalRevenue: 0,
                avgOrderValue: 0,
                totalCustomers: 0,
                ordersByStatus: {},
            };
        }
    });
}
// ============================================================================
// ORDER ITEMS FUNCTIONS
// ============================================================================
function addOrderItem(orderItem) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { data, error } = yield exports.supabase
                .from("order_items")
                .insert(Object.assign(Object.assign({}, orderItem), { created_at: new Date().toISOString() }))
                .select()
                .single();
            if (error) {
                console.error("❌ Failed to add order item:", error);
                throw error;
            }
            return data;
        }
        catch (error) {
            console.error("❌ Error in addOrderItem:", error);
            throw error;
        }
    });
}
function getOrderItems(orderId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { data, error } = yield exports.supabase
                .from("order_items")
                .select(`
        *,
        products (
          product_name,
          product_code
        ),
        packages (
          package_name,
          package_code
        )
      `)
                .eq("order_id", orderId);
            if (error) {
                console.error("❌ Failed to get order items:", error);
                throw error;
            }
            return data || [];
        }
        catch (error) {
            console.error("❌ Error in getOrderItems:", error);
            return [];
        }
    });
}
function updateOrderItem(itemId, updates) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { data, error } = yield exports.supabase
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
        }
        catch (error) {
            console.error("❌ Error in updateOrderItem:", error);
            throw error;
        }
    });
}
function deleteOrderItem(itemId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { error } = yield exports.supabase
                .from("order_items")
                .delete()
                .eq("id", itemId);
            if (error) {
                console.error("❌ Failed to delete order item:", error);
                throw error;
            }
        }
        catch (error) {
            console.error("❌ Error in deleteOrderItem:", error);
            throw error;
        }
    });
}
// ============================================================================
// COMPLEX ORDER CREATION WITH ITEMS
// ============================================================================
function createOrderWithItems(orderData) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Calculate total amount
            const itemsTotal = orderData.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
            const totalAmount = itemsTotal + (orderData.postage || 0) + (orderData.website_charges || 0);
            // Create the order
            const order = yield createSimpleOrder(Object.assign(Object.assign({}, orderData), { total_amount: totalAmount }));
            // Update order with calculated amounts
            const { data: updatedOrder, error: updateError } = yield exports.supabase
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
            if (updateError)
                throw updateError;
            // Add order items
            const orderItems = [];
            for (const item of orderData.items) {
                const orderItem = yield addOrderItem({
                    order_id: order.id,
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
        }
        catch (error) {
            console.error("❌ Error in createOrderWithItems:", error);
            throw error;
        }
    });
}
// ============================================================================
// MESSAGE FUNCTIONS
// ============================================================================
function insertMessage(message) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { data, error } = yield exports.supabase
                .from("messages")
                .insert([message])
                .select("id")
                .single();
            if (error) {
                console.error("❌ Failed to insert message:", error);
                throw error;
            }
            return data.id;
        }
        catch (error) {
            console.error("❌ Error in insertMessage:", error);
            throw error;
        }
    });
}
function upsertConversation(phoneNumber, lastMessageAt) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { error } = yield exports.supabase
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
        }
        catch (error) {
            console.error("❌ Error in upsertConversation:", error);
            throw error;
        }
    });
}
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
function testNormalizedConnection() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { error } = yield exports.supabase.from("customers").select("id").limit(1);
            if (error) {
                console.error("❌ Normalized schema connection test failed:", error);
                return false;
            }
            console.log("✅ Normalized Supabase connection successful");
            return true;
        }
        catch (error) {
            console.error("❌ Normalized Supabase connection failed:", error);
            return false;
        }
    });
}
// ============================================================================
// LEGACY COMPATIBILITY FUNCTIONS
// ============================================================================
function insertOrder(orderData) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const order = yield createSimpleOrder({
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
            return order.id;
        }
        catch (error) {
            console.error("❌ Error in legacy insertOrder:", error);
            throw error;
        }
    });
}
function bulkInsertOrders(orders) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`📦 Bulk inserting ${orders.length} orders using normalized schema...`);
        let successCount = 0;
        let errorCount = 0;
        for (const order of orders) {
            try {
                yield insertOrder(order);
                successCount++;
            }
            catch (error) {
                console.error(`❌ Failed to insert order:`, error);
                errorCount++;
            }
        }
        console.log(`✅ Bulk insert completed: ${successCount} success, ${errorCount} errors`);
    });
}
