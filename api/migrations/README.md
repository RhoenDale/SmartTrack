# Database Migrations

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
