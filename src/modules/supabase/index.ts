import { createClient } from "@supabase/supabase-js";
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

console.log("Supabase URL:", supabaseUrl ? "Loaded" : "Not Loaded");
console.log("Supabase Key:", supabaseKey ? "Loaded" : "Not Loaded");

export const supabase = createClient(supabaseUrl, supabaseKey);
