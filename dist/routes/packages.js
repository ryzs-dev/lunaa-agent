"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/packages.ts - Packages Only
const express_1 = __importDefault(require("express"));
const supabaseNormalized_1 = require("../database/supabaseNormalized");
const packagesRouter = express_1.default.Router();
// ============================================================================
// PACKAGES ROUTES
// ============================================================================
// GET /api/packages - Get all packages
packagesRouter.get("/", async (req, res) => {
    try {
        const { is_active = "true", limit = 100, offset = 0, search } = req.query;
        let query = supabaseNormalized_1.supabase
            .from("packages")
            .select("*", { count: "exact" })
            .order("package_name", { ascending: true });
        // Apply filters
        if (is_active !== "all") {
            query = query.eq("is_active", is_active === "true");
        }
        if (search) {
            query = query.or(`package_name.ilike.%${search}%,package_code.ilike.%${search}%,description.ilike.%${search}%`);
        }
        // Apply pagination
        query = query.range(Number(offset), Number(offset) + Number(limit) - 1);
        const { data, error, count } = await query;
        if (error) {
            console.error("❌ Failed to fetch packages:", error);
            throw error;
        }
        res.json({
            success: true,
            data: data || [],
            pagination: {
                offset: Number(offset),
                limit: Number(limit),
                total: count || 0,
            },
        });
    }
    catch (error) {
        console.error("❌ Failed to fetch packages:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch packages",
            details: error instanceof Error ? error.message : String(error),
        });
    }
});
// GET /api/packages/:id - Get single package
packagesRouter.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabaseNormalized_1.supabase
            .from("packages")
            .select("*")
            .eq("id", id)
            .single();
        if (error) {
            if (error.code === "PGRST116") {
                return res.status(404).json({
                    success: false,
                    error: "Package not found",
                });
            }
            throw error;
        }
        res.json({
            success: true,
            data,
        });
    }
    catch (error) {
        console.error("❌ Failed to get package:", error);
        res.status(500).json({
            success: false,
            error: "Failed to get package",
            details: error instanceof Error ? error.message : String(error),
        });
    }
});
// POST /api/packages - Create new package
packagesRouter.post("/", async (req, res) => {
    var _a;
    try {
        const packageData = req.body;
        // Validate required fields
        if (!packageData.package_name) {
            return res.status(400).json({
                success: false,
                error: "Package name is required",
            });
        }
        // Check if package code already exists (if provided)
        if (packageData.package_code) {
            const existingPackage = await (0, supabaseNormalized_1.getPackageByCode)(packageData.package_code);
            if (existingPackage) {
                return res.status(409).json({
                    success: false,
                    error: "Package code already exists",
                });
            }
        }
        const { data, error } = await supabaseNormalized_1.supabase
            .from("packages")
            .insert(Object.assign(Object.assign({}, packageData), { is_active: (_a = packageData.is_active) !== null && _a !== void 0 ? _a : true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }))
            .select()
            .single();
        if (error) {
            console.error("❌ Failed to create package:", error);
            throw error;
        }
        res.status(201).json({
            success: true,
            data,
            message: "Package created successfully",
        });
    }
    catch (error) {
        console.error("❌ Failed to create package:", error);
        res.status(500).json({
            success: false,
            error: "Failed to create package",
            details: error instanceof Error ? error.message : String(error),
        });
    }
});
// PUT /api/packages/:id - Update package
packagesRouter.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        // Add updated timestamp
        updates.updated_at = new Date().toISOString();
        const { data, error } = await supabaseNormalized_1.supabase
            .from("packages")
            .update(updates)
            .eq("id", id)
            .select()
            .single();
        if (error) {
            if (error.code === "PGRST116") {
                return res.status(404).json({
                    success: false,
                    error: "Package not found",
                });
            }
            throw error;
        }
        res.json({
            success: true,
            data,
            message: "Package updated successfully",
        });
    }
    catch (error) {
        console.error("❌ Failed to update package:", error);
        res.status(500).json({
            success: false,
            error: "Failed to update package",
            details: error instanceof Error ? error.message : String(error),
        });
    }
});
// DELETE /api/packages/:id - Delete package
packagesRouter.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { hard_delete = false } = req.query;
        if (hard_delete === "true") {
            // Hard delete
            const { error } = await supabaseNormalized_1.supabase.from("packages").delete().eq("id", id);
            if (error)
                throw error;
        }
        else {
            // Soft delete
            const { error } = await supabaseNormalized_1.supabase
                .from("packages")
                .update({
                is_active: false,
                updated_at: new Date().toISOString(),
            })
                .eq("id", id);
            if (error)
                throw error;
        }
        res.json({
            success: true,
            message: hard_delete === "true"
                ? "Package deleted permanently"
                : "Package deactivated",
        });
    }
    catch (error) {
        console.error("❌ Failed to delete package:", error);
        res.status(500).json({
            success: false,
            error: "Failed to delete package",
            details: error instanceof Error ? error.message : String(error),
        });
    }
});
exports.default = packagesRouter;
