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
// src/routes/products.ts - Products Only
const express_1 = __importDefault(require("express"));
const supabaseNormalized_1 = require("../database/supabaseNormalized");
const productsRouter = express_1.default.Router();
// ============================================================================
// PRODUCTS ROUTES
// ============================================================================
// GET /api/products - Get all products
productsRouter.get("/", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { category, is_active = "true", limit = 100, offset = 0, search, } = req.query;
        let query = supabaseNormalized_1.supabase
            .from("products")
            .select("*", { count: "exact" })
            .order("product_name", { ascending: true });
        // Apply filters
        if (category) {
            query = query.eq("category", category);
        }
        if (is_active !== "all") {
            query = query.eq("is_active", is_active === "true");
        }
        if (search) {
            query = query.or(`product_name.ilike.%${search}%,product_code.ilike.%${search}%,description.ilike.%${search}%`);
        }
        // Apply pagination
        query = query.range(Number(offset), Number(offset) + Number(limit) - 1);
        const { data, error, count } = yield query;
        if (error) {
            console.error("❌ Failed to fetch products:", error);
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
        console.error("❌ Failed to fetch products:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fetch products",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
// GET /api/products/:id - Get single product
productsRouter.get("/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { data, error } = yield supabaseNormalized_1.supabase
            .from("products")
            .select("*")
            .eq("id", id)
            .single();
        if (error) {
            if (error.code === "PGRST116") {
                return res.status(404).json({
                    success: false,
                    error: "Product not found",
                });
            }
            console.error("❌ Failed to get product:", error);
            throw error;
        }
        res.json({
            success: true,
            data,
        });
    }
    catch (error) {
        console.error("❌ Failed to get product:", error);
        res.status(500).json({
            success: false,
            error: "Failed to get product",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
// POST /api/products - Create new product
productsRouter.post("/", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const productData = req.body;
        // Validate required fields
        if (!productData.product_code || !productData.product_name) {
            return res.status(400).json({
                success: false,
                error: "Product code and name are required",
            });
        }
        // Check if product code already exists
        const existingProduct = yield (0, supabaseNormalized_1.getProductByCode)(productData.product_code);
        if (existingProduct) {
            return res.status(409).json({
                success: false,
                error: "Product code already exists",
            });
        }
        const { data, error } = yield supabaseNormalized_1.supabase
            .from("products")
            .insert(Object.assign(Object.assign({}, productData), { is_active: (_a = productData.is_active) !== null && _a !== void 0 ? _a : true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }))
            .select()
            .single();
        if (error) {
            console.error("❌ Failed to create product:", error);
            throw error;
        }
        res.status(201).json({
            success: true,
            data,
            message: "Product created successfully",
        });
    }
    catch (error) {
        console.error("❌ Failed to create product:", error);
        res.status(500).json({
            success: false,
            error: "Failed to create product",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
// PUT /api/products/:id - Update product
productsRouter.put("/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const updates = req.body;
        // Add updated timestamp
        updates.updated_at = new Date().toISOString();
        const { data, error } = yield supabaseNormalized_1.supabase
            .from("products")
            .update(updates)
            .eq("id", id)
            .select()
            .single();
        if (error) {
            if (error.code === "PGRST116") {
                return res.status(404).json({
                    success: false,
                    error: "Product not found",
                });
            }
            throw error;
        }
        res.json({
            success: true,
            data,
            message: "Product updated successfully",
        });
    }
    catch (error) {
        console.error("❌ Failed to update product:", error);
        res.status(500).json({
            success: false,
            error: "Failed to update product",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
// DELETE /api/products/:id - Delete product (soft delete by setting is_active = false)
productsRouter.delete("/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { hard_delete = false } = req.query;
        if (hard_delete === "true") {
            // Hard delete
            const { error } = yield supabaseNormalized_1.supabase.from("products").delete().eq("id", id);
            if (error)
                throw error;
        }
        else {
            // Soft delete
            const { error } = yield supabaseNormalized_1.supabase
                .from("products")
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
                ? "Product deleted permanently"
                : "Product deactivated",
        });
    }
    catch (error) {
        console.error("❌ Failed to delete product:", error);
        res.status(500).json({
            success: false,
            error: "Failed to delete product",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
// ============================================================================
// PRODUCTS META ROUTES
// ============================================================================
// GET /api/products/categories - Get unique product categories
productsRouter.get("/meta/categories", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { data, error } = yield supabaseNormalized_1.supabase
            .from("products")
            .select("category")
            .not("category", "is", null)
            .neq("category", "");
        if (error)
            throw error;
        // Get unique categories
        const categories = [
            ...new Set(data === null || data === void 0 ? void 0 : data.map((item) => item.category).filter(Boolean)),
        ];
        res.json({
            success: true,
            data: categories,
        });
    }
    catch (error) {
        console.error("❌ Failed to get categories:", error);
        res.status(500).json({
            success: false,
            error: "Failed to get categories",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
exports.default = productsRouter;
