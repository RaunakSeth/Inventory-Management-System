# PG Inventory

A home/PG inventory system: scan a barcode to add stock, snap a photo of a bill
to bulk-add everything on it, and get warned before things run out — built as
an installable PWA (works as your "scanner app" right from a phone browser).

## How it works

- **`product_library`** — your shared product catalog. Seeded automatically
  from Open Food Facts on first barcode scan; falls back to Gemini vision
  (photo → product name/category/unit) when a barcode isn't found there; you
  can also just type it in manually. Once a product's been added once, every
  future scan of that barcode is instant (no API calls needed).
- **`stock_items` + `transactions`** — quantity on hand is *never* edited
  directly. Every restock/usage is an immutable ledger row; current quantity
  is always the sum of the ledger. This is what lets `recompute_consumption_rates()`
  compute a real "days until empty" estimate later, not just a static
  snapshot.
- **Bill scanning** — photo → Gemini (structured JSON of line items) → fuzzy
  match against `product_library` (Postgres `pg_trgm` similarity) → you
  review/uncheck anything wrong → confirmed rows post `bill_scan` transactions
  in bulk.
- **Low-stock dashboard** — flags anything at/below its reorder threshold,
  *or* projected to run out within ~3 days based on its consumption rate.

## Why this isn't a fork of HomeBox/Shelf.nu

Both are real, mature projects and worth knowing about, but neither's data
model fits a *consumable* inventory well — they're built for tracking unique
serialized assets (equipment, custody, bookings), not "we have 3.2kg of rice
left." I borrowed two things that were genuinely well-designed and directly
applicable: Shelf.nu's `quantity`/`minQuantity`/`unitOfMeasure`/`ConsumptionLog`
schema shape, and its browser-based barcode scanning approach
(`react-webcam` + a WASM barcode reader, no native app required). Everything
else here is built fresh for your use case, on the stack you asked for.

## One-time setup

### 1. Supabase project
1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. In the SQL Editor, run the three migration files **in order**:
   `supabase/migrations/0001_init.sql`, `0002_consumption_rate.sql`,
   `0003_fuzzy_match.sql`.
3. (Optional but recommended) Database → Extensions → enable `pg_cron`, then
   run the commented-out `cron.schedule(...)` line at the bottom of
   `0002_consumption_rate.sql` so consumption rates recompute nightly on
   their own.
4. Authentication → Providers → make sure Email is enabled (magic link sign-in
   is what the app uses — no passwords to manage for your PG staff).

### 2. Gemini API key
1. Get a key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Install the Supabase CLI, then from the project root:
   ```bash
   supabase login
   supabase link --project-ref your-project-ref
   supabase secrets set GEMINI_API_KEY=your_key_here
   supabase functions deploy gemini-bill-parse
   supabase functions deploy product-lookup
   supabase functions deploy product-identify-photo
   ```

### 3. Frontend
```bash
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from
# Supabase Dashboard -> Settings -> API
npm install
npm run dev
```

### 4. Testing the camera on your phone
Camera access (`getUserMedia`) requires a secure context. `localhost` works
fine for testing on your laptop, but **your phone on the same Wi-Fi hitting
`http://192.168.x.x:5173` will not get camera permission** — browsers block
camera access on plain HTTP except for localhost. Two easy options:
- Deploy to Vercel/Netlify (both give you free HTTPS) and just use that URL
  on your phone — this also means everyone at the PG can open the same link
  and "install" it as an app (Add to Home Screen).
- Or run locally with a self-signed cert via `mkcert` + `vite --https`.

Once it's installed from a real HTTPS URL, it behaves like an app: full
screen, works offline for the shell (though scanning always needs a live
connection, deliberately — see `vite.config.ts` comment on why API responses
aren't cached).

## Project layout

```
supabase/migrations/        Postgres schema (run these in Supabase SQL editor)
supabase/functions/         Edge functions (Gemini + Open Food Facts calls — key stays server-side)
src/pages/                  Dashboard (low stock), Scan (barcode + bill), Products
src/components/             BarcodeScanner, BillScanner, ProductQuickAdd, AuthGate
src/lib/                    Supabase client, edge function wrappers, shared types
```

## Sensible next steps (not built yet, on purpose — get the core loop working first)

- **Locations**: the `locations` table exists but nothing in the UI creates/assigns
  them yet — useful once you want to distinguish "kitchen store" vs "cleaning
  cupboard" stock.
- **Low-stock notifications**: right now the dashboard is pull (you open the
  app); a Supabase Edge Function + cron hitting a WhatsApp/Telegram/email
  webhook when `low_stock_items` grows would make it push instead.
- **Multi-PG support**: if you ever run more than one property, add a
  `household_id` column across the tables and scope RLS policies to it —
  the schema was kept single-tenant deliberately so the SQL stays readable
  while you validate the core workflow.
- **Bulk CSV import**: for the first stock-take (typing in everything you
  already own once), a CSV → `product_library` + `stock_items` importer would
  save a lot of manual scanning.
