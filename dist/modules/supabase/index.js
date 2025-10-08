"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../../../.env.local") });
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log("Supabase URL:", supabaseUrl ? "Loaded" : "Not Loaded");
console.log("Supabase Key:", supabaseKey ? "Loaded" : "Not Loaded");
exports.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
