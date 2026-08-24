import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "https://gizfmmmepykxgbjxyhcc.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "missing-key";

if (supabaseKey === "missing-key" || supabaseKey === "YOUR_SUPABASE_SERVICE_ROLE_KEY") {
  console.warn("CRITICAL: Supabase service role key is missing or set to placeholder in .env. Storage features (Smart Drive, Attachments) will return 500 errors.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export const BUCKET_NAME = "comm-unity-assets";
