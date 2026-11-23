-- Quick fix for Paksiw's transactions
-- This will link all transactions from old names to your current user

-- Step 1: First, let's see what your user ID is
SELECT id, name, email, role FROM users WHERE name LIKE '%Paksiw%' OR email LIKE '%paksiw%';

-- Copy the ID from above (should be something like U001, U002, U003, etc.)
-- Then use it in the UPDATE statements below

-- Step 2: Find what old names were used in transactions
SELECT DISTINCT staff FROM transactions ORDER BY staff;

-- Step 3: Update transactions - REPLACE 'U003' with your actual user ID from Step 1
-- Uncomment and modify the lines below with your correct user ID

-- If your user ID is U003, and old transactions show these names:
-- UPDATE transactions SET staff_id = 'U003' WHERE staff = 'J. Dela Cruz';
-- UPDATE transactions SET staff_id = 'U003' WHERE staff = 'Maria';
-- UPDATE transactions SET staff_id = 'U003' WHERE staff LIKE '%Dela Cruz%';
-- UPDATE transactions SET staff_id = 'U003' WHERE staff LIKE '%Maria%';

-- Step 4: Verify it worked
SELECT 
    t.id,
    t.staff as 'Old Name (stored)',
    t.staff_id as 'User ID',
    u.name as 'Current Name',
    DATE_FORMAT(t.transacted_at, '%m/%d/%Y %H:%i') as 'Date'
FROM transactions t
LEFT JOIN users u ON t.staff_id = u.id
ORDER BY t.transacted_at DESC
LIMIT 15;

-- Step 5: Count total linked transactions
SELECT 
    COUNT(*) as 'Total Transactions',
    SUM(CASE WHEN staff_id IS NOT NULL THEN 1 ELSE 0 END) as 'Linked',
    SUM(CASE WHEN staff_id IS NULL THEN 1 ELSE 0 END) as 'Not Linked'
FROM transactions;
