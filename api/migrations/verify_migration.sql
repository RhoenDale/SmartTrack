-- Verification queries to check if migration worked

-- 1. Check if staff_id column exists
DESCRIBE transactions;

-- 2. Count how many transactions have staff_id populated
SELECT 
    'Total Transactions' as metric,
    COUNT(*) as count
FROM transactions
UNION ALL
SELECT 
    'With staff_id' as metric,
    COUNT(*) as count
FROM transactions
WHERE staff_id IS NOT NULL
UNION ALL
SELECT 
    'Without staff_id' as metric,
    COUNT(*) as count
FROM transactions
WHERE staff_id IS NULL;

-- 3. Show recent transactions with both old and new staff names
SELECT 
    t.id,
    t.staff as 'Old Name (Stored)',
    u.name as 'Current Name (From User)',
    t.staff_id as 'User ID',
    DATE_FORMAT(t.transacted_at, '%m/%d/%Y %H:%i') as 'Date'
FROM transactions t
LEFT JOIN users u ON t.staff_id = u.id
ORDER BY t.transacted_at DESC
LIMIT 15;

-- 4. Show all users for reference
SELECT 
    id as 'User ID',
    name as 'Current Name',
    role as 'Role',
    email as 'Email'
FROM users
ORDER BY id;

-- 5. Find transactions that didn't get matched (if any)
SELECT 
    t.staff as 'Unmatched Staff Name',
    COUNT(*) as 'Transaction Count',
    MIN(t.transacted_at) as 'First Transaction',
    MAX(t.transacted_at) as 'Last Transaction'
FROM transactions t
WHERE t.staff_id IS NULL
GROUP BY t.staff
ORDER BY COUNT(*) DESC;
