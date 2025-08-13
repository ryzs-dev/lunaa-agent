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
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const sync_1 = require("../sheets-db/sync");
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../../.env.local") });
const syncRouter = express_1.default.Router();
syncRouter.post("/", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const sheetName = ((_a = req.body) === null || _a === void 0 ? void 0 : _a.sheetName) || "Test";
    try {
        console.log(`📦 Starting sync for sheet: ${sheetName}`);
        yield (0, sync_1.syncNewOrdersOnly)(sheetName);
        res.json({
            success: true,
            message: `✅ Successfully synced new orders from sheet: ${sheetName}`,
        });
    }
    catch (error) {
        console.error("❌ Sync failed:", error);
        res.status(500).json({
            success: false,
            error: "Sync failed",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
syncRouter.post("/full-sync", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const sheetName = ((_a = req.body) === null || _a === void 0 ? void 0 : _a.sheetName) || "Test";
    try {
        console.log(`📦 Starting sync for sheet: ${sheetName}`);
        yield (0, sync_1.syncSheetsToD1)(sheetName);
        res.json({
            success: true,
            message: `✅ Successfully synced new orders from sheet: ${sheetName}`,
        });
    }
    catch (error) {
        console.error("❌ Sync failed:", error);
        res.status(500).json({
            success: false,
            error: "Sync failed",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
// Optionally add structure validation route
syncRouter.get("/validate-sheet", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const sheetName = ((_b = (_a = req.query) === null || _a === void 0 ? void 0 : _a.sheetName) === null || _b === void 0 ? void 0 : _b.toString()) || "Test";
    try {
        const isValid = yield (0, sync_1.validateSheetStructure)(sheetName);
        res.json({ success: isValid });
    }
    catch (error) {
        console.error("❌ Sheet validation failed:", error);
        res.status(500).json({
            success: false,
            error: "Validation failed",
            details: error instanceof Error ? error.message : String(error),
        });
    }
}));
exports.default = syncRouter;
