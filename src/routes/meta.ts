// src/routes/meta.ts - Statistics and Meta Routes
import express from "express";
import { supabase } from "../database/supabaseNormalized";

const metaRouter = express.Router();

// ============================================================================
// META/STATISTICS ROUTES
// ============================================================================

// GET /api/meta/stats - Get products and packages statistics
metaRouter.get("/stats", async (req, res) => {
  try {
    // Get product stats
    const { data: productStats, error: productError } = await supabase
      .from("products")
      .select("is_active, category");

    if (productError) throw productError;

    // Get package stats
    const { data: packageStats, error: packageError } = await supabase
      .from("packages")
      .select("is_active");

    if (packageError) throw packageError;

    // Get order stats
    const { data: orderStats, error: orderError } = await supabase
      .from("orders")
      .select("status, total_amount, currency, order_date");

    if (orderError) throw orderError;

    // Get customer stats
    const { count: customersCount, error: customersError } = await supabase
      .from("customers")
      .select("*", { count: "exact", head: true });

    if (customersError) throw customersError;

    const stats = {
      products: {
        total: productStats?.length || 0,
        active: productStats?.filter((p) => p.is_active).length || 0,
        inactive: productStats?.filter((p) => !p.is_active).length || 0,
        categories: [
          ...new Set(productStats?.map((p) => p.category).filter(Boolean)),
        ].length,
      },
      packages: {
        total: packageStats?.length || 0,
        active: packageStats?.filter((p) => p.is_active).length || 0,
        inactive: packageStats?.filter((p) => !p.is_active).length || 0,
      },
      orders: {
        total: orderStats?.length || 0,
        totalRevenue:
          orderStats?.reduce(
            (sum, order) => sum + (order.total_amount || 0),
            0
          ) || 0,
        avgOrderValue:
          orderStats?.length > 0
            ? orderStats.reduce(
                (sum, order) => sum + (order.total_amount || 0),
                0
              ) / orderStats.length
            : 0,
        byStatus:
          orderStats?.reduce((acc, order) => {
            acc[order.status || "unknown"] =
              (acc[order.status || "unknown"] || 0) + 1;
            return acc;
          }, {} as Record<string, number>) || {},
      },
      customers: {
        total: customersCount || 0,
      },
      system: {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      },
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("❌ Failed to get stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get stats",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /api/meta/categories - Get unique product categories
metaRouter.get("/categories", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("category")
      .not("category", "is", null)
      .neq("category", "");

    if (error) throw error;

    // Get unique categories
    const categories = [
      ...new Set(data?.map((item) => item.category).filter(Boolean)),
    ];

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error("❌ Failed to get categories:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get categories",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /api/meta/health - System health check
metaRouter.get("/health", async (req, res) => {
  try {
    // Test database connections
    const { error: productsError } = await supabase
      .from("products")
      .select("id")
      .limit(1);

    const { error: packagesError } = await supabase
      .from("packages")
      .select("id")
      .limit(1);

    const { error: ordersError } = await supabase
      .from("orders")
      .select("id")
      .limit(1);

    const { error: customersError } = await supabase
      .from("customers")
      .select("id")
      .limit(1);

    const errors = [
      productsError,
      packagesError,
      ordersError,
      customersError,
    ].filter(Boolean);

    if (errors.length > 0) {
      return res.status(500).json({
        success: false,
        error: "Database connection issues",
        details: errors.map((e) => e?.message).join(", "),
      });
    }

    res.json({
      success: true,
      data: {
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: "connected",
        tables: {
          products: "accessible",
          packages: "accessible",
          orders: "accessible",
          customers: "accessible",
        },
      },
    });
  } catch (error) {
    console.error("❌ Health check failed:", error);
    res.status(500).json({
      success: false,
      error: "Health check failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// GET /api/meta/dashboard - Dashboard overview data
metaRouter.get("/dashboard", async (req, res) => {
  try {
    const { period = "30" } = req.query; // Days to look back

    const daysBack = parseInt(period as string);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    // Get recent orders
    const { data: recentOrders, error: ordersError } = await supabase
      .from("orders")
      .select("total_amount, currency, order_date, status")
      .gte("order_date", cutoffDate.toISOString())
      .order("order_date", { ascending: false });

    if (ordersError) throw ordersError;

    // Get product/package counts
    const { count: activeProducts } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);

    const { count: activePackages } = await supabase
      .from("packages")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);

    // Get customer count
    const { count: totalCustomers } = await supabase
      .from("customers")
      .select("*", { count: "exact", head: true });

    // Calculate metrics
    const totalRevenue =
      recentOrders?.reduce(
        (sum, order) => sum + (order.total_amount || 0),
        0
      ) || 0;
    const totalOrders = recentOrders?.length || 0;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Group orders by status
    const ordersByStatus =
      recentOrders?.reduce((acc, order) => {
        acc[order.status || "unknown"] =
          (acc[order.status || "unknown"] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

    // Revenue by day (last 7 days)
    const revenueByDay = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.setHours(0, 0, 0, 0)).toISOString();
      const dayEnd = new Date(date.setHours(23, 59, 59, 999)).toISOString();

      const dayRevenue =
        recentOrders
          ?.filter(
            (order) =>
              order.order_date >= dayStart && order.order_date <= dayEnd
          )
          .reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;

      revenueByDay.push({
        date: date.toISOString().split("T")[0],
        revenue: dayRevenue,
      });
    }

    res.json({
      success: true,
      data: {
        period: daysBack,
        summary: {
          totalRevenue,
          totalOrders,
          avgOrderValue,
          totalCustomers: totalCustomers || 0,
          activeProducts: activeProducts || 0,
          activePackages: activePackages || 0,
        },
        ordersByStatus,
        revenueByDay,
        recentOrders: recentOrders?.slice(0, 10) || [], // Last 10 orders
      },
    });
  } catch (error) {
    console.error("❌ Failed to get dashboard data:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get dashboard data",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default metaRouter;
