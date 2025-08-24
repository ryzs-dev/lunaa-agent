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
// src/routes/packages.ts - Packages Only
const express_1 = __importDefault(require("express"));
const supabaseNormalized_1 = require("../database/supabaseNormalized");
const packagesRouter = express_1.default.Router();
// ============================================================================
// PACKAGES ROUTES
// ============================================================================
// GET /api/packages - Get all packages
packagesRouter.get("/", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const { data, error, count } = yield query;
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
}));
// GET /api/packages/:id - Get single package
packagesRouter.get("/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { data, error } = yield supabaseNormalized_1.supabase
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
}));
// POST /api/packages - Create new package
packagesRouter.post("/", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
            const existingPackage = yield (0, supabaseNormalized_1.getPackageByCode)(packageData.package_code);
            if (existingPackage) {
                return res.status(409).json({
                    success: false,
                    error: "Package code already exists",
                });
            }
        }
        const { data, error } = yield supabaseNormalized_1.supabase
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
}));
// PUT /api/packages/:id - Update package
packagesRouter.put("/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const updates = req.body;
        // Add updated timestamp
        updates.updated_at = new Date().toISOString();
        const { data, error } = yield supabaseNormalized_1.supabase
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
}));
// DELETE /api/packages/:id - Delete package
packagesRouter.delete("/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { hard_delete = false } = req.query;
        if (hard_delete === "true") {
            // Hard delete
            const { error } = yield supabaseNormalized_1.supabase.from("packages").delete().eq("id", id);
            if (error)
                throw error;
        }
        else {
            // Soft delete
            const { error } = yield supabaseNormalized_1.supabase
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
}));
exports.default = packagesRouter;
