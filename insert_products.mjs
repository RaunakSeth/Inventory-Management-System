import fs from "fs";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://kxckudwndqtknnleabwh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4Y2t1ZHduZHF0a25ubGVhYndoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNjgzMzMsImV4cCI6MjA5OTk0NDMzM30.lWVE26R3qqEjRUSYiZyENztjBD1j20rirLX--eUqFjI";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  const raw = fs.readFileSync("seed_products.json", "utf-8");
  const products = JSON.parse(raw);

  console.log(`Inserting ${products.length} products...`);

  const batches = [];
  for (let i = 0; i < products.length; i += 50) {
    batches.push(products.slice(i, i + 50));
  }

  let inserted = 0;
  let errors = 0;

  for (const batch of batches) {
    const { data, error } = await supabase
      .from("product_library")
      .upsert(batch, { onConflict: "barcode", ignoreDuplicates: true });

    if (error) {
      console.error("Batch error:", error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }

    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\nDone. Inserted: ${inserted}, Errors: ${errors}`);

  // Verify count
  const { count } = await supabase
    .from("product_library")
    .select("*", { count: "exact", head: true });

  console.log(`Total rows in product_library: ${count}`);
}

main().catch(console.error);
