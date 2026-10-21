# Database Migrations

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
