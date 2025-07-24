import express from "express";
import { getAllOrders } from "../database/d1Database";

const orderRouter = express.Router();

orderRouter.get("/orders", async (req, res) => {
  try {
    const orders = await getAllOrders();
    res.json(orders);
  } catch (err) {
    console.error("Failed to fetch orders:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default orderRouter;
