import fs from "fs";
import path from "path";

// Use relative path from the script location
const filePath = path.resolve(__dirname, "./processed.json");

export function getProcessed(): Set<string> {
  try {
    if (!fs.existsSync(filePath)) {
      console.log("📝 No processed.json file found, starting fresh");
      return new Set();
    }

    const data = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(data);

    // Handle both array format and object format
    if (Array.isArray(parsed)) {
      console.log(
        `📋 Loaded ${parsed.length} previously processed tracking numbers`
      );
      return new Set(parsed);
    } else if (parsed.processed && Array.isArray(parsed.processed)) {
      console.log(
        `📋 Loaded ${parsed.processed.length} previously processed tracking numbers`
      );
      return new Set(parsed.processed);
    }

    console.log("📝 Invalid processed.json format, starting fresh");
    return new Set();
  } catch (error) {
    console.error("❌ Error reading processed.json:", error);
    return new Set();
  }
}

export function saveProcessed(processed: Set<string>): void {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Save with metadata for better tracking
    const data = {
      processed: Array.from(processed),
      lastUpdated: new Date().toISOString(),
      count: processed.size,
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("❌ Error saving processed.json:", error);
  }
}

/**
 * Add a single tracking number to processed list
 * @param trackingNumber - Tracking number to mark as processed
 */
export function addProcessed(trackingNumber: string): void {
  const processed = getProcessed();
  processed.add(trackingNumber);
  saveProcessed(processed);
}

/**
 * Check if a tracking number has been processed
 * @param trackingNumber - Tracking number to check
 * @returns true if already processed
 */
export function isProcessed(trackingNumber: string): boolean {
  const processed = getProcessed();
  return processed.has(trackingNumber);
}

/**
 * Remove a tracking number from processed list (if you need to reprocess)
 * @param trackingNumber - Tracking number to remove
 */
export function removeProcessed(trackingNumber: string): void {
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
export function clearProcessed(): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log("🗑️ Cleared all processed tracking numbers");
    }
  } catch (error) {
    console.error("❌ Error clearing processed.json:", error);
  }
}

/**
 * Get statistics about processed items
 */
export function getStats(): {
  count: number;
  lastUpdated: string | null;
  sample: string[];
} {
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

      if (Array.isArray(data)) {
        return {
          count: data.length,
          lastUpdated: null,
          sample: data.slice(-5), // Last 5 items
        };
      } else if (data.processed) {
        return {
          count: data.count || data.processed.length,
          lastUpdated: data.lastUpdated || null,
          sample: data.processed.slice(-5), // Last 5 items
        };
      }
    }
  } catch (error) {
    console.error("❌ Error reading stats:", error);
  }

  return { count: 0, lastUpdated: null, sample: [] };
}
