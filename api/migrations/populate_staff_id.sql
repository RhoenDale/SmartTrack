-- Populate staff_id for existing transactions
-- Run this if you get "Duplicate column name 'staff_id'" error

-- Step 1: Clear any existing staff_id values to start fresh
UPDATE `transactions` SET staff_id = NULL;

-- Step 2: Match by last name (most reliable)
UPDATE `transactions` t
INNER JOIN `users` u ON (
    t.staff LIKE CONCAT('%', SUBSTRING_INDEX(u.name, ' ', -1), '%')
)
SET t.staff_id = u.id
WHERE t.staff_id IS NULL;

-- Step 3: Match by first initial and last name
-- For "J. Dela Cruz", find user where first name starts with J and contains Dela Cruz
UPDATE `transactions` t
INNER JOIN `users` u ON (
    SUBSTRING(u.name, 1, 1) = SUBSTRING(t.staff, 1, 1)
    AND t.staff LIKE CONCAT('%', SUBSTRING_INDEX(u.name, ' ', -1), '%')
)
SET t.staff_id = u.id
WHERE t.staff_id IS NULL;

-- Step 4: Match full names (case insensitive)
UPDATE `transactions` t
INNER JOIN `users` u ON LOWER(TRIM(t.staff)) = LOWER(TRIM(u.name))
SET t.staff_id = u.id
WHERE t.staff_id IS NULL;

-- Step 5: Fuzzy match (remove dots and spaces)
UPDATE `transactions` t
INNER JOIN `users` u ON (
    REPLACE(REPLACE(LOWER(t.staff), '.', ''), ' ', '') 
    LIKE CONCAT('%', LOWER(SUBSTRING_INDEX(u.name, ' ', -1)), '%')
)
SET t.staff_id = u.id
WHERE t.staff_id IS NULL AND LENGTH(t.staff) > 0;

-- Step 6: Show results
SELECT 
    'Transactions with staff_id' as Status,
    COUNT(*) as Count
FROM `transactions` 
WHERE staff_id IS NOT NULL
UNION ALL
SELECT 
    'Transactions without staff_id' as Status,
    COUNT(*) as Count
FROM `transactions` 
WHERE staff_id IS NULL;

-- Step 7: Show sample of matched transactions
SELECT 
    t.id as 'Transaction ID',
    t.staff as 'Old Name',
    u.name as 'Current Name',
    t.staff_id as 'User ID',
    DATE_FORMAT(t.transacted_at, '%m/%d/%Y %H:%i') as 'Date'
FROM transactions t
LEFT JOIN users u ON t.staff_id = u.id
ORDER BY t.transacted_at DESC
LIMIT 10;

-- Step 8: Show unmatched transactions (if any)
SELECT 
    t.staff as 'Unmatched Name',
    COUNT(*) as 'Count'
FROM transactions t
WHERE t.staff_id IS NULL AND t.staff != ''
GROUP BY t.staff;
