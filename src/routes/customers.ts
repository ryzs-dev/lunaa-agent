// src/routes/customers.ts - Customer Management Routes
import express from "express";
import { supabase } from "../database/supabaseNormalized";
import CustomerService from "../modules/customer/service";
import { UUID } from "crypto";

const customersRouter = express.Router();

const customerService = new CustomerService()

// ============================================================================
// CUSTOMERS ROUTES
// ============================================================================\

// GET /api/customers - Get all customers
customersRouter.get("/", async (req, res) => {
  const { limit, offset, search, sortBy, sortOrder } = req.query;

  try {
    const { customers, pagination } = await customerService.getAllCustomers({
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
      search: search ? String(search) : undefined,
      sortBy: sortBy ? String(sortBy) : undefined,
      sortOrder: sortOrder === "asc" ? "asc" : "desc",
    });

    res.status(200).json({
      data: customers,
      pagination,
    });
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// GET /api/customers/:phone_number - Get customer by phone number
customersRouter.get("/:phone_number", async (req, res)=> {
  const { phone_number} = req.params

  if(!phone_number){
    return res.status(400).json({error: "Phone number is required"})
  }

  const customer = await customerService.getCustomerByPhoneNumber(phone_number);

  if(!customer){
    return res.status(404).json({error: "Customer not found"})
  }

  res.status(200).json(customer);
})

// POST /api/customers - Create or update customer
customersRouter.post("/", async (req, res) => {
  const customerData = req.body;

  if (!customerData || !customerData.phone_number || !customerData.name) {
    return res
      .status(400)
      .json({ error: "Phone Number and Customer Name are required" });
  }

  try {
    const customer = await customerService.createCustomer(customerData);

    return res.status(201).json({
      success: "Customer successfully inserted or updated",
      data: customer,
    });
  } catch (error) {
    console.error("Error creating customer:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/customers/:id - Delete customer by ID
customersRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: "Customer ID is required" });
  }
  try {
    await customerService.deleteCustomer(id as UUID);
    return res.status(200).json({ success: "Customer successfully deleted" });
  } catch (error) {
    console.error("Error deleting customer:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
})

// PATCH /api/customers/:id - Update customer by ID
customersRouter.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  if (!id) {
    return res.status(400).json({ error: "Customer ID is required" });
  }

  try {
    const updatedCustomer = await customerService.updateCustomer(id as UUID, updates);
    return res.status(200).json({
      success: "Customer successfully updated",
      data: updatedCustomer,
    });
  } catch (error) {
    console.error("Error updating customer:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
})


// ============================================================================
// LEGACY CUSTOMERS ROUTES
// ============================================================================

// GET /api/customers - Get all customers with stats
customersRouter.get("/s", async (req, res) => {
  try {
    const { 
      limit = 100,
      offset = 0,
      search,
      customer_type,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = req.query;

    let query = supabase
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
    const sortField = validSortFields.includes(sort_by as string) ? sort_by as string : 'created_at';
    query = query.order(sortField, { ascending: sort_order === 'asc' });

    // Apply pagination
    query = query.range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error("❌ Failed to fetch customers:", error);
      throw error;
    }

    // Calculate customer stats
    const customersWithStats = data?.map(customer => {
      const orders = customer.orders || [];
      const totalSpent = orders.reduce((sum: any, order: { total_amount: any; }) => sum + (order.total_amount || 0), 0);
      const totalOrders = orders.length;
      const lastOrderDate = orders.length > 0 
        ? orders.sort((a: { order_date: string | number | Date; }, b: { order_date: string | number | Date; }) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime())[0].order_date
        : null;

      return {
        ...customer,
        total_orders: totalOrders,
        total_spent: totalSpent,
        average_order_value: totalOrders > 0 ? totalSpent / totalOrders : 0,
        last_order_date: lastOrderDate
      };
    }) || [];

    res.json({
      success: true,
      data: customersWithStats,
      pagination: {
        offset: Number(offset),
        limit: Number(limit),
        total: count || 0
      }
    });
  } catch (error) {
    console.error("❌ Failed to fetch customers:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch customers",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /api/customers/:id - Get single customer with full details
customersRouter.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
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
    const totalSpent = orders.reduce((sum: any, order: { total_amount: any; }) => sum + (order.total_amount || 0), 0);
    const avgOrderValue = orders.length > 0 ? totalSpent / orders.length : 0;
    const lastOrderDate = orders.length > 0 
      ? orders.sort((a: { order_date: string | number | Date; }, b: { order_date: string | number | Date; }) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime())[0].order_date
      : null;

    const customerWithStats = {
      ...data,
      total_orders: orders.length,
      total_spent: totalSpent,
      average_order_value: avgOrderValue,
      last_order_date: lastOrderDate
    };

    res.json({
      success: true,
      data: customerWithStats
    });
  } catch (error) {
    console.error("❌ Failed to get customer:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get customer",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// PUT /api/customers/:id - Update customer
customersRouter.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Add updated timestamp
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
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
  } catch (error) {
    console.error("❌ Failed to update customer:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update customer",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// POST /api/customers/:id/addresses - Add address to customer
customersRouter.post("/:id/addresses", async (req, res) => {
  try {
    const { id } = req.params;
    const addressData = req.body;

    // Verify customer exists
    const { data: customer, error: customerError } = await supabase
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
      await supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('customer_id', id);
    }

    const { data, error } = await supabase
      .from("addresses")
      .insert({
        customer_id: parseInt(id),
        ...addressData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
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
  } catch (error) {
    console.error("❌ Failed to add address:", error);
    res.status(500).json({
      success: false,
      error: "Failed to add address",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /api/customers/stats/overview - Customer statistics
customersRouter.get("/stats/overview", async (req, res) => {
  try {
    const { period = '30' } = req.query; // Days to look back
    
    const daysBack = parseInt(period as string);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    // Get customer counts
    const { count: totalCustomers } = await supabase
      .from("customers")
      .select("*", { count: "exact", head: true });

    const { count: newCustomers } = await supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .gte("created_at", cutoffDate.toISOString());

    const { count: repeatCustomers } = await supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("customer_type", "repeat");

    // Get order statistics for customer analysis
    const { data: customerOrders, error: ordersError } = await supabase
      .from("orders")
      .select("customer_id, total_amount")
      .gte("order_date", cutoffDate.toISOString());

    if (ordersError) throw ordersError;

    // Calculate average customer metrics
    const customerOrderCounts = customerOrders?.reduce((acc, order) => {
      acc[order.customer_id] = (acc[order.customer_id] || 0) + 1;
      return acc;
    }, {} as Record<number, number>) || {};

    const customerSpending = customerOrders?.reduce((acc, order) => {
      acc[order.customer_id] = (acc[order.customer_id] || 0) + (order.total_amount || 0);
      return acc;
    }, {} as Record<number, number>) || {};

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
          newCustomerRate: (totalCustomers ?? 0) > 0 ? ((newCustomers || 0) / (totalCustomers ?? 0) * 100).toFixed(1) : 0
        },
        averages: {
          ordersPerCustomer: parseFloat(avgOrdersPerCustomer.toFixed(2)),
          spendingPerCustomer: parseFloat(avgSpendingPerCustomer.toFixed(2))
        },
        activeCustomers: Object.keys(customerOrderCounts).length
      }
    });
  } catch (error) {
    console.error("❌ Failed to get customer stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get customer stats",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// GET /api/customers/search/phone/:phone - Search customer by phone
customersRouter.get("/search/phone/:phone", async (req, res) => {
  try {
    const { phone } = req.params;

    const { data, error } = await supabase
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
  } catch (error) {
    console.error("❌ Failed to search customer:", error);
    res.status(500).json({
      success: false,
      error: "Failed to search customer",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});



export default customersRouter;