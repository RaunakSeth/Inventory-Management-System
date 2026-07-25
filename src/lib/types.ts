export type ProductSource = "open_food_facts" | "barcode_lookup" | "gemini_vision" | "manual";

export interface Product {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  default_unit: string;
  pack_size: number | null;
  image_url: string | null;
  source: ProductSource;
  description?: string | null;
  product_group_id?: string | null;
}

export interface Location {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

export interface StockItem {
  id: string;
  product_id: string;
  location_id: string | null;
  quantity: number;
  unit: string;
  min_quantity: number;
  avg_daily_consumption: number | null;
  last_restocked_at: string | null;
  best_before_date?: string | null;
  opened_at?: string | null;
}

export interface LowStockRow {
  stock_item_id: string;
  product_name: string;
  category: string | null;
  quantity: number;
  unit: string;
  min_quantity: number;
  avg_daily_consumption: number | null;
  estimated_days_remaining: number | null;
  location_name: string | null;
}

export interface BillLineItem {
  raw_text: string;
  parsed_name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
}

export interface BillParseResult {
  vendor_name: string | null;
  total_amount: number | null;
  line_items: BillLineItem[];
}

export interface ProductLookupResult {
  found: boolean;
  source?: ProductSource;
  barcode?: string;
  name?: string;
  brand?: string | null;
  category?: string | null;
  image_url?: string | null;
  pack_size_raw?: string | null;
  likely_unit?: string;
  confidence?: number;
}

export interface QuantityUnit {
  id: string;
  name: string;
  name_plural: string | null;
  factor_to_base: number;
  base_unit_id: string | null;
}

export interface ProductGroup {
  id: string;
  name: string;
  parent_id: string | null;
}

export interface Store {
  id: string;
  name: string;
  address: string | null;
}

export interface ShoppingListItem {
  id: string;
  product_id: string | null;
  custom_name: string | null;
  quantity: number;
  unit: string;
  note: string | null;
  done: boolean;
  created_at: string;
}
