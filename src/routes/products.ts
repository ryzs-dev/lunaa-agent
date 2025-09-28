import express from "express";
import ProductService from "../modules/product/service";
import { UUID } from "crypto";

const productsRouter = express.Router();

const productService = new ProductService();

// GET /api/products - Get all products
productsRouter.get('/', async (req, res) => {
    try {
        const products = await productService.getAllProducts();
        res.json({products:products, total: products.length});
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/products/:id - Get a product by ID
productsRouter.get('/:id', async (req, res) => {
    const productId = req.params.id;

    try {
        const product = await productService.getProductById(productId as UUID);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json({ product });
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/products - Create a new product
productsRouter.post('/', async (req, res) => {
    const productData = req.body;

    try {
        const newProduct = await productService.createProduct(productData);
        res.status(201).json({ product: newProduct });
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PATCH /api/products/:id - Update a product by ID
productsRouter.patch('/:id', async (req, res) => {
    const productId = req.params.id;
    const updates = req.body;
    try {
        const updatedProduct = await productService.updateProduct(productId as UUID, updates);
        res.json({ product: updatedProduct });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/products/:id - Delete a product by ID
productsRouter.delete('/:id', async (req, res) => {
    const productId = req.params.id;

    try {
        await productService.deleteProduct(productId as UUID);
        res.status(204).json({
            success: true,
            message: 'Product deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default productsRouter;
