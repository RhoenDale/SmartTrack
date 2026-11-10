# Database Migrations

## Activity Logs

Back up the `smarttrack` database, then run
`create_activity_logs.sql` once in phpMyAdmin or with the MySQL CLI before
deploying the updated app. The API records each authenticated request with the
user, method, route, response status, and timestamp. It intentionally does not
store request bodies, credentials, or query-string values. Admins can review
the shared history and filter it by user. Other signed-in users can view only
their own history from Preferences → My Activity Log.

## Link Users to Roles

Back up the `smarttrack` database and ensure `create_roles_table.sql` has been
applied. Before adding the user-role foreign key, run the orphan check in
`add_user_role_foreign_key.sql`. Every user role must match an existing
`roles.id`; resolve any mismatches by assigning the intended role or creating
the missing role rather than deleting user records. Then run the migration once.
The API also validates role assignments when users are created or updated.

To allow a user to hold more than one role, back up the database and apply
`add_multiple_roles_per_user.sql` after this migration. It creates the
`user_roles` link table and backfills each user's current `users.role` value;
the existing column remains the primary/legacy role. The Owner / Superadmin
can assign Admin, Inventory Manager, and Cashier roles. Admins can assign only
Inventory Manager and Cashier roles. The API enforces these limits independently
of the interface. Users with multiple roles choose the role to use after
signing in; API requests validate that selection against their assigned roles
and apply only the selected role for that session.

## Supplier Purchase Orders and Delivery Tracking

Back up the `smarttrack` database, then run
`create_supplier_purchase_orders.sql` once in phpMyAdmin before using the
Purchases page. The migration adds order, order-item, and partial-receipt
records. Receiving a delivery also creates the corresponding inventory batch;
creating an order alone does not change stock. The Purchases page is available
to admins and inventory managers. Supplier fulfillment is calculated from
recorded quantities and does not measure delivery timeliness.

For databases that already have purchase-order tables, run
`harden_purchase_order_relations.sql` once after backing up. First run all of its
orphan-count checks separately and resolve any nonzero results before applying
the migration. In particular, do not delete orphaned purchase history just to
make the migration pass; identify and repair or archive those records first.
It aligns user-ID columns, preserves creator/receiver IDs, and
adds foreign keys for order items and receipts. Then run
`add_cancelled_status_to_purchase_orders.sql` once so order cancellation is
supported. New installations get those constraints and the `cancelled` status
from `create_supplier_purchase_orders.sql`. The API returns a migration-required
response rather than a database 500 when an existing installation is missing
these schema updates.

## Recycle Bin Product History and Automatic Purge

Back up the `smarttrack` database. After applying
`create_supplier_purchase_orders.sql` and
`harden_purchase_order_relations.sql`, run `recycle_bin_product_history.sql`
once. It saves product names on purchase-order lines and changes product links
to `ON DELETE SET NULL`, preserving purchase and receipt history when a product
is permanently purged. An open order whose product was purged cannot receive
new stock; the API reports that condition.

The API automatically permanently deletes users and products at least 30 days
after they enter the Recycle Bin, on the next active notification refresh.
Product auto-purge waits until the purchase-history migration is applied.

## Multiple Categories per Product

Products can be assigned one or more categories. For an existing database, run
`add_multiple_product_categories.sql` once in phpMyAdmin or with the MySQL CLI
before deploying the updated app. The migration splits legacy labels on `/`,
creates separate category records and product links, then removes the old
`products.category` column. For example, `Vitamin / Supplement` becomes two
assignments, `Vitamin` and `Supplement`. Back up the database before running
the migration. Fresh databases created from `smarttrack.sql` already use the
normalized link table and do not need this migration. This migration is a
one-time conversion and must not be run again after the legacy column is dropped.

Each sale is attributed to every category assigned to its product. A product
assigned to both `Vitamin` and `Supplement` therefore contributes its sales to
both category totals. The chart shows each category separately and normalizes
the category totals into percentages; category totals can overlap when products
have multiple categories.

## Return Inspection Queue

For an existing database, back up the `smarttrack` database and run
`add_return_dispositions.sql` once in phpMyAdmin or with the MySQL CLI before
deploying the updated app. Fresh databases created from `smarttrack.sql`
already include the required table. Cashiers can submit returns and record the
refund immediately; inventory managers then use the Returns page to mark each
returned item as restocked or broken. Restocked items are added back to
inventory only after the manager confirms their condition. The Returns page is
available to inventory managers and admins; admins can review requests and
their disposition status but cannot process them.

## Broken Stock Loss Reporting

For an existing database, run `add_broken_loss_amount.sql` once before
deploying the updated app. Fresh databases created with
`create_product_returns_table.sql` include the column. New standalone broken
stock records capture the FIFO batch cost at the time stock is removed.
Historical records remain unvalued because their consumed batch costs were not
recorded. Customer refunds are reported separately; returned items marked
broken are not added again as standalone broken-stock write-offs.
To show already-recorded broken-stock costs in the Transactions page's
Adjustment amount column, run `backfill_broken_adjustment_amounts.sql` after
the loss amount column is available. New broken-stock adjustment transactions
store their recorded batch-cost loss automatically.

## Separate Product IDs and Barcodes

Back up the `smarttrack` database, then run
`separate_product_id_and_barcode.sql` once in phpMyAdmin or with the MySQL CLI.
The migration changes product IDs to auto-incrementing integers, remaps existing
batch, transaction, and notification references, and adds a unique nullable
barcode column. Existing products keep a blank barcode until the actual package
is scanned or its barcode is entered. Fresh databases created from
`smarttrack.sql` already use this schema.

Inventory managers scan a product barcode into the first field when adding a
product. In New Sale, the barcode scanner field is selected by default; common
USB/Bluetooth scanners that type the code and press Enter work without a special
device driver.

## Make batch expiry dates optional

Products and batches without an expiry date can be saved and sold without expiry
alerts or expiry-date sale blocks. For an existing database, run
`make_batch_expiry_optional.sql` once using phpMyAdmin or the MySQL command line.
Fresh databases created from `smarttrack.sql` already allow empty batch expiry
dates.

## Step-by-Step: Fix Staff Names in Transactions

### Step 1: Run the Migration

#### Option A: Using phpMyAdmin (Recommended)
1. Open phpMyAdmin: http://localhost/phpmyadmin
2. Select the `smarttrack` database from the left sidebar
3. Click on the "SQL" tab at the top
4. Open the file `add_staff_id_to_transactions.sql` in a text editor
5. Copy ALL the contents
6. Paste into the SQL query box in phpMyAdmin
7. Click "Go" button
8. Check the results - it will show how many transactions were matched

#### Option B: Using MySQL Command Line
```bash
cd C:\xampp\htdocs\SmartTrack\api\migrations
mysql -u root smarttrack < add_staff_id_to_transactions.sql
```

### Step 2: Verify the Migration

Run this query in phpMyAdmin SQL tab:
```sql
SELECT 
    t.id, 
    t.staff as old_name, 
    u.name as current_name,
    t.transacted_at
FROM transactions t
LEFT JOIN users u ON t.staff_id = u.id
ORDER BY t.transacted_at DESC
LIMIT 10;
```

You should see the `current_name` column showing the updated user names.

### Step 3: Manual Fix (If Needed)

If Step 2 shows NULL values in `current_name` or wrong names:

1. First, get your user IDs:
```sql
SELECT id, name, email FROM users ORDER BY id;
```

2. Then manually link transactions to the correct user. For example:
```sql
-- If your user ID is U003 and old transactions show "J. Dela Cruz"
UPDATE transactions 
SET staff_id = 'U003' 
WHERE staff LIKE '%Dela Cruz%';

-- Replace 'U003' with your actual user ID
-- Replace '%Dela Cruz%' with the pattern from your old transactions
```

3. Use the `fix_staff_id_manual.sql` file for more examples

### Step 4: Refresh the Frontend

1. Close and reopen your browser
2. Or press Ctrl+Shift+R to hard refresh
3. Go to Transactions page
4. Staff names should now show the updated names

## What This Does

**Before:** Transactions store staff name as text (e.g., "J. Dela Cruz")  
**After:** Transactions link to user ID, always showing current name (e.g., "Paksiw")

When a user updates their name from "Juan Dela Cruz" to "Paksiw", all past transactions will automatically show "Paksiw" instead of the old name.

## Troubleshooting

**Problem:** Transactions still show old names

**Solution 1:** Make sure you ran the migration SQL
- Check if `staff_id` column exists: `DESCRIBE transactions;`
- If not, run the migration again

**Solution 2:** Check if staff_id is populated
```sql
SELECT COUNT(*) as with_id FROM transactions WHERE staff_id IS NOT NULL;
```
- If 0 or very low, use the manual fix script

**Solution 3:** Clear browser cache
- Press Ctrl+Shift+Delete
- Clear cached images and files
- Reload the page
