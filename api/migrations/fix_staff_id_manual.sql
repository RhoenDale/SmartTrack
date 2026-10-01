-- Manual fix for staff_id linkage
-- Use this if the automatic migration didn't match all records correctly

-- Step 1: Check current user IDs and names
SELECT id, name, email FROM users ORDER BY id;

-- Step 2: Check transactions without staff_id
SELECT id, staff, transacted_at FROM transactions WHERE staff_id IS NULL ORDER BY transacted_at DESC LIMIT 10;

-- Step 3: Manual mapping examples (modify based on your actual user IDs and names)
-- Replace 'U001', 'U002', etc. with your actual user IDs from Step 1

-- Example: If "J. Dela Cruz" should map to user U003 (Paksiw)
-- UPDATE transactions SET staff_id = 'U003' WHERE staff LIKE '%Dela Cruz%' OR staff LIKE '%J.%Cruz%';

-- Example: If "M. Santos" should map to user U002
-- UPDATE transactions SET staff_id = 'U002' WHERE staff LIKE '%Santos%' OR staff LIKE '%M.%Santos%';

-- Step 4: Update all transactions with a specific staff name pattern
-- Uncomment and modify these based on your actual data:

-- UPDATE transactions SET staff_id = 'U003' WHERE staff = 'J. Dela Cruz';
-- UPDATE transactions SET staff_id = 'U002' WHERE staff = 'M. Santos';
-- UPDATE transactions SET staff_id = 'U001' WHERE staff = 'A. Reyes';

-- Step 5: Verify the updates
SELECT 
    t.id, 
    t.staff as old_staff_name, 
    t.staff_id,
    u.name as current_staff_name,
    t.transacted_at
FROM transactions t
LEFT JOIN users u ON t.staff_id = u.id
ORDER BY t.transacted_at DESC
LIMIT 20;

-- Step 6: Count matched vs unmatched
SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN staff_id IS NOT NULL THEN 1 ELSE 0 END) as with_staff_id,
    SUM(CASE WHEN staff_id IS NULL THEN 1 ELSE 0 END) as without_staff_id
FROM transactions;
