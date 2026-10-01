-- ========================================
-- ONE-STEP FIX: Update All Staff Names
-- ========================================
-- This will link all your old transactions to show your current name

-- Step 1: Show your current user info
SELECT '=== YOUR USER INFO ===' as '';
SELECT id, name, email, role FROM users;

-- Step 2: Show what names are currently in transactions
SELECT '=== OLD NAMES IN TRANSACTIONS ===' as '';
SELECT DISTINCT staff, COUNT(*) as count FROM transactions GROUP BY staff ORDER BY count DESC;

-- Step 3: AUTOMATIC MATCHING - This will match all variations
-- Match by last name "Dela Cruz" or "Delantar"
UPDATE transactions t
INNER JOIN users u ON (
    t.staff LIKE CONCAT('%', SUBSTRING_INDEX(u.name, ' ', -1), '%')
    OR t.staff LIKE CONCAT('%', SUBSTRING_INDEX(SUBSTRING_INDEX(u.name, ' ', -1), ' ', 1), '%')
)
SET t.staff_id = u.id
WHERE t.staff_id IS NULL OR t.staff_id = '';

-- Match by first initial
UPDATE transactions t
INNER JOIN users u ON (
    SUBSTRING(t.staff, 1, 1) = SUBSTRING(u.name, 1, 1)
    AND (
        t.staff LIKE CONCAT('%', SUBSTRING_INDEX(u.name, ' ', -1), '%')
        OR REPLACE(REPLACE(LOWER(t.staff), '.', ''), ' ', '') LIKE CONCAT('%', LOWER(SUBSTRING_INDEX(u.name, ' ', -1)), '%')
    )
)
SET t.staff_id = u.id
WHERE t.staff_id IS NULL OR t.staff_id = '';

-- Match full name (case insensitive)
UPDATE transactions t
INNER JOIN users u ON LOWER(TRIM(t.staff)) = LOWER(TRIM(u.name))
SET t.staff_id = u.id
WHERE t.staff_id IS NULL OR t.staff_id = '';

-- Step 4: VERIFY RESULTS
SELECT '=== RESULTS ===' as '';
SELECT 
    COUNT(*) as 'Total Transactions',
    SUM(CASE WHEN staff_id IS NOT NULL AND staff_id != '' THEN 1 ELSE 0 END) as 'Successfully Linked',
    SUM(CASE WHEN staff_id IS NULL OR staff_id = '' THEN 1 ELSE 0 END) as 'Still Unlinked'
FROM transactions;

-- Step 5: SHOW RECENT TRANSACTIONS WITH NEW NAMES
SELECT '=== PREVIEW: Last 10 Transactions ===' as '';
SELECT 
    t.id as 'TXN ID',
    t.staff as 'Old Name (stored)',
    COALESCE(u.name, t.staff) as 'Current Name (will show)',
    t.type,
    t.amount,
    DATE_FORMAT(t.transacted_at, '%m/%d/%Y %H:%i') as 'Date'
FROM transactions t
LEFT JOIN users u ON t.staff_id = u.id
ORDER BY t.transacted_at DESC
LIMIT 10;

-- Step 6: SHOW ANY UNMATCHED NAMES (if any)
SELECT '=== UNMATCHED NAMES (if any) ===' as '';
SELECT 
    t.staff as 'Name',
    COUNT(*) as 'Count',
    'Run manual UPDATE' as 'Action Needed'
FROM transactions t
WHERE (t.staff_id IS NULL OR t.staff_id = '') AND t.staff != ''
GROUP BY t.staff;
