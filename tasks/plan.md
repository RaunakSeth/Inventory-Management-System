# Implementation Plan: Store Management, Price Entry, Units, Product Groups

## Overview
All 4 feature tables already exist in the DB (migration 0006). The work is wiring up UI, extending existing pages, and adding management pages. No new migrations needed.

## Architecture Decisions
- **Stores**: already in `stores` table + `transactions.store_id`. Add store selector in restock flow, store management page, show store on transaction history.
- **Price entry**: `transactions.unit_price` exists. Add price input to restock flow, compute inventory value on Dashboard.
- **Quantity units**: `quantity_units` table exists with seed data. Add dropdown selectors using the table (instead of free text), add management in Settings.
- **Product groups**: `product_groups` table exists with seed data + `product_library.product_group_id` FK. Add group filter on Dashboard, group assignment in Products, management in Settings.

## Task List

### Phase 1: Store Management
- [ ] Task 1: Store management UI (CRUD in Settings or dedicated page)
- [ ] Task 2: Store selector in restock flow (Scan/QuickAdd)
- [ ] Task 3: Show store on Dashboard stock cards + transaction history

### Phase 2: Price Entry
- [ ] Task 4: Price input field in restock flow
- [ ] Task 5: Inventory value summary on Dashboard

### Phase 3: Quantity Units
- [ ] Task 6: Unit dropdown selectors (replace free text) using quantity_units table
- [ ] Task 7: Unit management UI in Settings

### Phase 4: Product Groups
- [ ] Task 8: Group assignment in Products page (dropdown on product cards)
- [ ] Task 9: Group filter on Dashboard
- [ ] Task 10: Group management UI in Settings

### Checkpoint: Complete
- [ ] All features working, typecheck passes, committed

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Store association scope unclear | Med | Stores link to transactions (which store you bought from), not stock items directly |
| Unit conversion complexity | Low | Skip conversion for now, just use unit names as labels |
| Settings page getting crowded | Low | Add a dedicated "Manage" section with tabs |

## Open Questions
- Should store be per-transaction (where bought) or per-stock-item (where stored)? → Per-transaction (already in schema)
