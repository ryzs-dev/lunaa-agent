"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
exports.getOrCreateCustomer = getOrCreateCustomer;
exports.upsertCustomer = upsertCustomer;
exports.updateCustomerStats = updateCustomerStats;
exports.getCustomerByPhone = getCustomerByPhone;
exports.getCustomerWithAddresses = getCustomerWithAddresses;
exports.createAddress = createAddress;
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
exports.createCompleteOrder = createCompleteOrder;
exports.getOrderByTrackingNumber = getOrderByTrackingNumber;
exports.bulkInsertNormalizedOrders = bulkInsertNormalizedOrders;
exports.createSimpleOrder = createSimpleOrder;
exports.getRecentOrders = getRecentOrders;
exports.searchOrders = searchOrders;
exports.getDashboardStats = getDashboardStats;
exports.getCustomerOrderHistory = getCustomerOrderHistory;
exports.findDuplicateCustomers = findDuplicateCustomers;
exports.addOrderItem = addOrderItem;
exports.getOrderItems = getOrderItems;
exports.updateOrderItem = updateOrderItem;
exports.deleteOrderItem = deleteOrderItem;
exports.createOrderWithItems = createOrderWithItems;
exports.insertMessage = insertMessage;
exports.upsertConversation = upsertConversation;
exports.testNormalizedConnection = testNormalizedConnection;
exports.getOrdersWithDetails = getOrdersWithDetails;
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
/**
 * Get or create customer by phone number
 */
async function getOrCreateCustomer(customerData) {
    try {
        let existingCustomer = null;
        // Try to find existing customer by phone number first
        if (customerData.phone_number) {
            const { data } = await exports.supabase
                .from("customers")
                .select("*")
                .eq("phone_number", customerData.phone_number)
                .single();
            existingCustomer = data;
        }
        // If no phone number match, try by name and fb_name
        if (!existingCustomer && customerData.fb_name) {
            const { data } = await exports.supabase
                .from("customers")
                .select("*")
                .eq("customer_name", customerData.customer_name)
                .eq("fb_name", customerData.fb_name)
                .single();
            existingCustomer = data;
        }
        if (existingCustomer) {
            console.log(`✅ Found existing customer: ${existingCustomer.customer_name} (ID: ${existingCustomer.id})`);
            // Update customer type if this is a repeat order
            if (customerData.customer_type === "repeat" && existingCustomer.customer_type === "new") {
                const { data: updatedCustomer } = await exports.supabase
                    .from("customers")
                    .update({
                    customer_type: "repeat",
                    updated_at: new Date().toISOString()
                })
                    .eq("id", existingCustomer.id)
                    .select("*")
                    .single();
                return updatedCustomer || existingCustomer;
            }
            return existingCustomer;
        }
        // Create new customer
        console.log(`📝 Creating new customer: ${customerData.customer_name}`);
        const { data: newCustomer, error } = await exports.supabase
            .from("customers")
            .insert({
            customer_name: customerData.customer_name,
            phone_number: customerData.phone_number,
            fb_name: customerData.fb_name,
            customer_type: customerData.customer_type || "new",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
            .select("*")
            .single();
        if (error) {
            console.error("❌ Failed to create customer:", error);
            throw error;
        }
        console.log(`✅ Created new customer: ${newCustomer.customer_name} (ID: ${newCustomer.id})`);
        return newCustomer;
    }
    catch (error) {
        console.error("❌ Error in getOrCreateCustomer:", error);
        throw error;
    }
}
async function upsertCustomer(customerData) {
    var _a;
    try {
        console.log(`Upserting customer: phone=${customerData.phone_number}, name=${customerData.customer_name}`);
        // First, try to find existing customer by phone number
        const { data: existingCustomer, error: findError } = await exports.supabase
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
            const { data: updatedCustomer, error: updateError } = await exports.supabase
                .from("customers")
                .update({
                // Update name if the new one is more complete
                customer_name: customerData.customer_name.length > (((_a = existingCustomer.customer_name) === null || _a === void 0 ? void 0 : _a.length) || 0)
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
            if (updateError)
                throw updateError;
            console.log(`Updated existing customer: id=${updatedCustomer.id}, name=${updatedCustomer.customer_name}, type=${updatedCustomer.customer_type}`);
            return updatedCustomer;
        }
        else {
            // Customer doesn't exist - create new one
            const { data: newCustomer, error: insertError } = await exports.supabase
                .from("customers")
                .insert(Object.assign(Object.assign({}, customerData), { customer_type: 'new', total_orders: 0, total_spent: 0, average_order_value: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }))
                .select()
                .single();
            if (insertError)
                throw insertError;
            console.log(`Created new customer: id=${newCustomer.id}, phone=${newCustomer.phone_number}`);
            return newCustomer;
        }
    }
    catch (error) {
        console.error("Error in upsertCustomer:", error);
        throw error;
    }
}
async function updateCustomerStats(customerId, orderAmount) {
    try {
        // Get current customer stats
        const { data: customer, error: fetchError } = await exports.supabase
            .from("customers")
            .select("total_orders, total_spent, average_order_value")
            .eq("id", customerId)
            .single();
        if (fetchError)
            throw fetchError;
        const currentOrders = (customer.total_orders || 0) + 1;
        const currentSpent = (customer.total_spent || 0) + orderAmount;
        const newAverageOrderValue = currentSpent / currentOrders;
        // Update customer stats
        const { error: updateError } = await exports.supabase
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
        if (updateError)
            throw updateError;
        console.log(`Updated customer stats: id=${customerId}, orders=${currentOrders}, spent=${currentSpent.toFixed(2)}, avg=${newAverageOrderValue.toFixed(2)}`);
    }
    catch (error) {
        console.error("Error updating customer stats:", error);
        throw error;
    }
}
async function getCustomerByPhone(req, res) {
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
    }
    catch (error) {
        console.error("Error in getCustomerByPhoneEndpoint:", error);
        res.status(500).json({
            success: false,
            error: "Failed to get customer data",
            details: error instanceof Error ? error.message : String(error)
        });
    }
}
async function getCustomerWithAddresses(customerId) {
    try {
        const { data, error } = await exports.supabase
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
}
// ============================================================================
// ADDRESS FUNCTIONS
// ============================================================================
/**
 * Create address for customer
 */
async function createAddress(addressData) {
    try {
        if (!addressData.address) {
            return null; // No address data provided
        }
        console.log(`📝 Creating address for customer ${addressData.customer_id}`);
        const { data: newAddress, error } = await exports.supabase
            .from("addresses")
            .insert({
            customer_id: addressData.customer_id,
            address_line_1: addressData.address,
            city: addressData.city,
            postcode: addressData.postcode,
            state: addressData.state,
            country: "Malaysia", // Default for your business
            address_type: "shipping",
            is_default: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
            .select("*")
            .single();
        if (error) {
            console.error("❌ Failed to create address:", error);
            throw error;
        }
        console.log(`✅ Created address (ID: ${newAddress.id})`);
        return newAddress;
    }
    catch (error) {
        console.error("❌ Error in createAddress:", error);
        throw error;
    }
}
async function upsertAddress(addressData) {
    try {
        if (addressData.is_default) {
            await exports.supabase
                .from("addresses")
                .update({ is_default: false })
                .eq("customer_id", addressData.customer_id);
        }
        const { data, error } = await exports.supabase
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
}
async function getCustomerAddresses(customerId) {
    try {
        const { data, error } = await exports.supabase
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
}
// ============================================================================
// PRODUCT FUNCTIONS
// ============================================================================
async function getProducts() {
    try {
        const { data, error } = await exports.supabase
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
}
async function getProductByCode(productCode) {
    try {
        const { data, error } = await exports.supabase
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
}
async function createProduct(productData) {
    var _a;
    try {
        const { data, error } = await exports.supabase
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
}
async function updateProduct(productId, updates) {
    try {
        const { data, error } = await exports.supabase
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
}
async function deleteProduct(productId, hardDelete = false) {
    try {
        if (hardDelete) {
            const { error } = await exports.supabase
                .from("products")
                .delete()
                .eq("id", productId);
            if (error)
                throw error;
        }
        else {
            const { error } = await exports.supabase
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
}
// ============================================================================
// PACKAGE FUNCTIONS
// ============================================================================
async function getPackages() {
    try {
        const { data, error } = await exports.supabase
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
}
async function getPackageByCode(packageCode) {
    try {
        const { data, error } = await exports.supabase
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
}
async function createPackage(packageData) {
    var _a;
    try {
        const { data, error } = await exports.supabase
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
}
async function updatePackage(packageId, updates) {
    try {
        const { data, error } = await exports.supabase
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
}
async function deletePackage(packageId, hardDelete = false) {
    try {
        if (hardDelete) {
            const { error } = await exports.supabase
                .from("packages")
                .delete()
                .eq("id", packageId);
            if (error)
                throw error;
        }
        else {
            const { error } = await exports.supabase
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
}
// ============================================================================
// ORDER FUNCTIONS
// ============================================================================
/**
 * Create complete order with customer and address (MAIN FUNCTION)
 */
async function createCompleteOrder(orderInput) {
    try {
        console.log(`🔄 Creating complete order for: ${orderInput.customer_name}`);
        // 1. Get or create customer
        const customer = await getOrCreateCustomer({
            customer_name: orderInput.customer_name,
            phone_number: orderInput.phone_number,
            fb_name: orderInput.fb_name,
            customer_type: orderInput.customer_type,
        });
        // 2. Create address if provided
        const address = await createAddress({
            customer_id: customer.id,
            address: orderInput.address,
            city: orderInput.city,
            postcode: orderInput.postcode,
            state: orderInput.state,
        });
        // 3. Calculate totals if needed
        let totalAmount = orderInput.total_amount || orderInput.total_paid || 0;
        // If no total provided, calculate from package_price + postage
        if (!totalAmount && orderInput.package_price) {
            totalAmount = (orderInput.package_price || 0) + (orderInput.postage || 0);
        }
        // 4. Create the order
        const orderData = {
            customer_id: customer.id,
            shipping_address_id: address === null || address === void 0 ? void 0 : address.id,
            order_date: orderInput.order_date || new Date().toISOString().split('T')[0],
            status: orderInput.status || "pending",
            total_amount: totalAmount,
            subtotal: orderInput.package_price,
            postage: orderInput.postage,
            currency: orderInput.currency || "MYR",
            payment_method: orderInput.payment_method,
            payment_status: "paid", // Assume paid for historical imports
            tracking_number: orderInput.tracking_number,
            courier_company: orderInput.courier_company,
            shipment_description: orderInput.shipment_description,
            source: orderInput.source || "import",
            agent_name: orderInput.agent_name,
            notes: orderInput.remark,
            remark: orderInput.remark,
            created_at: orderInput.order_date ? `${orderInput.order_date}T00:00:00.000Z` : new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        console.log(`📝 Creating order for customer ${customer.id} with total ${totalAmount}`);
        const { data: newOrder, error } = await exports.supabase
            .from("orders")
            .insert(orderData)
            .select("*")
            .single();
        if (error) {
            console.error("❌ Failed to create order:", error);
            throw error;
        }
        console.log(`✅ Created order (ID: ${newOrder.id}) for ${customer.customer_name}`);
        return {
            customer,
            address,
            order: newOrder,
        };
    }
    catch (error) {
        console.error("❌ Error in createCompleteOrder:", error);
        throw error;
    }
}
/**
 * Get order by tracking number
 */
async function getOrderByTrackingNumber(trackingNumber) {
    try {
        const { data, error } = await exports.supabase
            .from("orders")
            .select("*")
            .eq("tracking_number", trackingNumber)
            .single();
        if (error && error.code !== "PGRST116") {
            console.error("❌ Failed to get order by tracking:", error);
            throw error;
        }
        return data || null;
    }
    catch (error) {
        console.error("❌ Error in getOrderByTrackingNumber:", error);
        return null;
    }
}
/**
 * Bulk insert orders (for importing from Google Sheets)
 */
async function bulkInsertNormalizedOrders(orders) {
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    console.log(`📦 Starting bulk insert of ${orders.length} orders...`);
    for (const orderInput of orders) {
        try {
            // Check for duplicates if tracking number exists
            if (orderInput.tracking_number) {
                const existing = await getOrderByTrackingNumber(orderInput.tracking_number);
                if (existing) {
                    console.log(`⏭️ Skipping duplicate order with tracking: ${orderInput.tracking_number}`);
                    continue;
                }
            }
            await createCompleteOrder(orderInput);
            successCount++;
            // Log progress every 10 orders
            if (successCount % 10 === 0) {
                console.log(`📊 Progress: ${successCount}/${orders.length} orders processed`);
            }
        }
        catch (error) {
            console.error(`❌ Failed to create order for ${orderInput.customer_name}:`, error);
            errorCount++;
            errors.push({ order: orderInput, error });
        }
    }
    console.log(`✅ Bulk insert completed: ${successCount} success, ${errorCount} errors`);
    return { successCount, errorCount, errors };
}
async function createSimpleOrder(orderData) {
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
        let addressId;
        if (orderData.address_line_1) {
            try {
                const address = await upsertAddress({
                    customer_id: customer.id,
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
            }
            catch (addressError) {
                console.log("Could not create address:", addressError);
            }
        }
        // 3. Generate unique order number
        const orderNumber = await generateUniqueOrderNumber();
        console.log(`Generated order number: ${orderNumber}`);
        // 4. Create the order
        const { data: order, error: orderError } = await exports.supabase
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
        if (orderError)
            throw orderError;
        // 5. Update customer statistics
        await updateCustomerStats(customer.id, orderData.total_amount);
        console.log(`Order created successfully: id=${order.id}, customer_id=${customer.id}, phone=${orderData.phone_number}`);
        return order;
    }
    catch (error) {
        console.error("Error in createSimpleOrder:", error);
        throw error;
    }
}
async function generateUniqueOrderNumber(maxRetries = 10) {
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
            const { data: latestOrder, error: queryError } = await exports.supabase
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
            if (latestOrder === null || latestOrder === void 0 ? void 0 : latestOrder.order_number) {
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
            const { data: existing, error: checkError } = await exports.supabase
                .from("orders")
                .select("order_number")
                .eq("order_number", orderNumber)
                .single();
            if (checkError && checkError.code === 'PGRST116') {
                // No existing order found - this number is available
                console.log(`Generated unique order number: ${orderNumber} (attempt ${attempt + 1})`);
                return orderNumber;
            }
            else if (checkError) {
                console.log(`Check error on attempt ${attempt + 1}:`, checkError);
                continue; // Retry on check errors
            }
            else {
                console.log(`Order number ${orderNumber} already exists, retrying (attempt ${attempt + 1})`);
                continue; // Number exists, retry
            }
        }
        catch (error) {
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
async function getRecentOrders(limit = 50) {
    try {
        const { data, error } = await exports.supabase
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
}
async function searchOrders(query) {
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
        const { data, error, count } = await orderQuery;
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
}
// export async function searchOrders(searchParams: {
//   searchTerm?: string;
//   phone?: string;
//   trackingNumber?: string;
//   limit?: number;
// }): Promise<{ orders: Order[]; totalCount: number }> {
//   try {
//     let query = supabase
//       .from("orders")
//       .select(`
//         *,
//         customers (
//           id,
//           customer_name,
//           phone_number,
//           fb_name,
//           email
//         ),
//         addresses (
//           id,
//           address_line_1,
//           city,
//           postcode,
//           state
//         )
//       `)
//       .order("created_at", { ascending: false });
//     if (searchParams.searchTerm) {
//       // Search across multiple fields
//       query = query.or(`
//         tracking_number.ilike.%${searchParams.searchTerm}%,
//         customers.customer_name.ilike.%${searchParams.searchTerm}%,
//         customers.phone_number.ilike.%${searchParams.searchTerm}%
//       `);
//     }
//     if (searchParams.phone) {
//       query = query.eq("customers.phone_number", searchParams.phone);
//     }
//     if (searchParams.trackingNumber) {
//       query = query.eq("tracking_number", searchParams.trackingNumber);
//     }
//     if (searchParams.limit) {
//       query = query.limit(searchParams.limit);
//     }
//     const { data, error, count } = await query;
//     if (error) {
//       console.error("❌ Failed to search orders:", error);
//       throw error;
//     }
//     return {
//       orders: data || [],
//       totalCount: count || 0,
//     };
//   } catch (error) {
//     console.error("❌ Error in searchOrders:", error);
//     throw error;
//   }
// }
async function getDashboardStats(filters) {
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
        const { data: orders, error: ordersError } = await orderQuery;
        if (ordersError)
            throw ordersError;
        const { count: customersCount, error: customersError } = await exports.supabase
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
}
async function getCustomerOrderHistory(phoneNumber) {
    try {
        // Get customer by phone number
        const { data: customer, error: customerError } = await exports.supabase
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
        const { data: orders, error: ordersError } = await exports.supabase
            .from("orders")
            .select("*")
            .eq("customer_id", customer.id)
            .order("order_date", { ascending: false });
        if (ordersError)
            throw ordersError;
        // Calculate stats
        const totalOrders = (orders === null || orders === void 0 ? void 0 : orders.length) || 0;
        const totalSpent = (orders === null || orders === void 0 ? void 0 : orders.reduce((sum, order) => sum + (order.total_amount || 0), 0)) || 0;
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
    }
    catch (error) {
        console.error("Error getting customer order history:", error);
        throw error;
    }
}
async function findDuplicateCustomers() {
    try {
        // Find phone numbers with multiple customer records
        const { data: duplicates, error } = await exports.supabase
            .from("customers")
            .select(`
        phone_number,
        id,
        customer_name,
        total_orders,
        created_at
      `)
            .order("phone_number");
        if (error)
            throw error;
        // Group by phone number
        const phoneGroups = duplicates.reduce((acc, customer) => {
            if (!acc[customer.phone_number]) {
                acc[customer.phone_number] = [];
            }
            acc[customer.phone_number].push(customer);
            return acc;
        }, {});
        // Return only phone numbers with multiple customers
        return Object.entries(phoneGroups)
            .filter(([_, customers]) => customers.length > 1)
            .map(([phone_number, customers]) => ({
            phone_number,
            customers,
            total_orders: customers.reduce((sum, c) => sum + (c.total_orders || 0), 0)
        }));
    }
    catch (error) {
        console.error("Error finding duplicate customers:", error);
        throw error;
    }
}
// ============================================================================
// ORDER ITEMS FUNCTIONS
// ============================================================================
async function addOrderItem(orderItem) {
    try {
        const { data, error } = await exports.supabase
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
}
async function getOrderItems(orderId) {
    try {
        const { data, error } = await exports.supabase
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
}
async function updateOrderItem(itemId, updates) {
    try {
        const { data, error } = await exports.supabase
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
}
async function deleteOrderItem(itemId) {
    try {
        const { error } = await exports.supabase
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
}
// ============================================================================
// COMPLEX ORDER CREATION WITH ITEMS
// ============================================================================
async function createOrderWithItems(orderData) {
    try {
        // Calculate total amount
        const itemsTotal = orderData.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
        const totalAmount = itemsTotal + (orderData.postage || 0) + (orderData.website_charges || 0);
        // Create the order
        const order = await createSimpleOrder(Object.assign(Object.assign({}, orderData), { total_amount: totalAmount }));
        // Update order with calculated amounts
        const { data: updatedOrder, error: updateError } = await exports.supabase
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
            const orderItem = await addOrderItem({
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
}
// ============================================================================
// MESSAGE FUNCTIONS
// ============================================================================
async function insertMessage(message) {
    try {
        const { data, error } = await exports.supabase
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
}
async function upsertConversation(phoneNumber, lastMessageAt) {
    try {
        const { error } = await exports.supabase
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
}
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
async function testNormalizedConnection() {
    try {
        const { error } = await exports.supabase.from("customers").select("id").limit(1);
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
}
// ============================================================================
// QUERY FUNCTIONS
// ============================================================================
/**
 * Get orders with joined customer and address data
 */
async function getOrdersWithDetails(options = {}) {
    try {
        let query = exports.supabase
            .from("orders")
            .select(`
        *,
        customers (
          id,
          customer_name,
          phone_number,
          fb_name,
          email,
          customer_type
        ),
        addresses (
          id,
          address_line_1,
          address_line_2,
          city,
          postcode,
          state,
          country
        )
      `)
            .order("created_at", { ascending: false });
        if (options.limit) {
            query = query.limit(options.limit);
        }
        if (options.offset) {
            query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
        }
        if (options.status) {
            query = query.eq("status", options.status);
        }
        const { data, error } = await query;
        if (error) {
            console.error("❌ Failed to get orders:", error);
            throw error;
        }
        return data || [];
    }
    catch (error) {
        console.error("❌ Error in getOrdersWithDetails:", error);
        throw error;
    }
}
