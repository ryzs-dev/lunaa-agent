"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProcessed = getProcessed;
exports.saveProcessed = saveProcessed;
exports.addProcessed = addProcessed;
exports.isProcessed = isProcessed;
exports.removeProcessed = removeProcessed;
exports.clearProcessed = clearProcessed;
exports.getStats = getStats;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Use relative path from the script location
const filePath = path_1.default.resolve(__dirname, "./processed.json");
function getProcessed() {
    try {
        if (!fs_1.default.existsSync(filePath)) {
            console.log("📝 No processed.json file found, starting fresh");
            return new Set();
        }
        const data = fs_1.default.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(data);
        // Handle both array format and object format
        if (Array.isArray(parsed)) {
            console.log(`📋 Loaded ${parsed.length} previously processed tracking numbers`);
            return new Set(parsed);
        }
        else if (parsed.processed && Array.isArray(parsed.processed)) {
            console.log(`📋 Loaded ${parsed.processed.length} previously processed tracking numbers`);
            return new Set(parsed.processed);
        }
        console.log("📝 Invalid processed.json format, starting fresh");
        return new Set();
    }
    catch (error) {
        console.error("❌ Error reading processed.json:", error);
        return new Set();
    }
}
function saveProcessed(processed) {
    try {
        // Ensure directory exists
        const dir = path_1.default.dirname(filePath);
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
        // Save with metadata for better tracking
        const data = {
            processed: Array.from(processed),
            lastUpdated: new Date().toISOString(),
            count: processed.size,
        };
        fs_1.default.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
    catch (error) {
        console.error("❌ Error saving processed.json:", error);
    }
}
/**
 * Add a single tracking number to processed list
 * @param trackingNumber - Tracking number to mark as processed
 */
function addProcessed(trackingNumber) {
    const processed = getProcessed();
    processed.add(trackingNumber);
    saveProcessed(processed);
}
/**
 * Check if a tracking number has been processed
 * @param trackingNumber - Tracking number to check
 * @returns true if already processed
 */
function isProcessed(trackingNumber) {
    const processed = getProcessed();
    return processed.has(trackingNumber);
}
/**
 * Remove a tracking number from processed list (if you need to reprocess)
 * @param trackingNumber - Tracking number to remove
 */
function removeProcessed(trackingNumber) {
    const processed = getProcessed();
    if (processed.has(trackingNumber)) {
        processed.delete(trackingNumber);
        saveProcessed(processed);
        console.log(`🗑️ Removed ${trackingNumber} from processed list`);
    }
}
/**
 * Clear all processed tracking numbers (use with caution)
 */
function clearProcessed() {
    try {
        if (fs_1.default.existsSync(filePath)) {
            fs_1.default.unlinkSync(filePath);
            console.log("🗑️ Cleared all processed tracking numbers");
        }
    }
    catch (error) {
        console.error("❌ Error clearing processed.json:", error);
    }
}
/**
 * Get statistics about processed items
 */
function getStats() {
    try {
        if (fs_1.default.existsSync(filePath)) {
            const data = JSON.parse(fs_1.default.readFileSync(filePath, "utf-8"));
            if (Array.isArray(data)) {
                return {
                    count: data.length,
                    lastUpdated: null,
                    sample: data.slice(-5), // Last 5 items
                };
            }
            else if (data.processed) {
                return {
                    count: data.count || data.processed.length,
                    lastUpdated: data.lastUpdated || null,
                    sample: data.processed.slice(-5), // Last 5 items
                };
            }
        }
    }
    catch (error) {
        console.error("❌ Error reading stats:", error);
    }
    return { count: 0, lastUpdated: null, sample: [] };
}
