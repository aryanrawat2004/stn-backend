import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = (
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ""
).trim();

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null;

export const databaseMode = supabase ? "supabase" : "memory";
export const databaseConfig = {
  hasUrl: Boolean(supabaseUrl),
  hasKey: Boolean(supabaseKey),
  keyType: supabaseKey.startsWith("sb_secret_")
    ? "secret"
    : supabaseKey
      ? "legacy-service-role"
      : "missing",
};
