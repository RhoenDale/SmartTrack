-- Migration: Add staff_id column to transactions table
-- This allows transactions to always show the current staff name

-- Step 1: Add staff_id column (nullable initially for existing records)
ALTER TABLE `transactions` 
ADD COLUMN `staff_id` VARCHAR(20) NULL AFTER `staff`;

-- Step 2: Create a temporary mapping table to help match staff names to user IDs
-- First, let's see what users we have and try to match them

-- Update strategy: Match by the abbreviated name pattern
-- Examples: "J. Dela Cruz" should match user with name containing "Dela Cruz"
-- "M. Santos" should match user with name containing "Santos"

-- Match pattern 1: Last name match (most reliable)
UPDATE `transactions` t
INNER JOIN `users` u ON (
    t.staff LIKE CONCAT('%', SUBSTRING_INDEX(u.name, ' ', -1), '%')
)
SET t.staff_id = u.id
WHERE t.staff_id IS NULL;

-- Match pattern 2: Try to match by first initial and last name
-- For "J. Dela Cruz", find user where first name starts with J and last name is Dela Cruz
UPDATE `transactions` t
INNER JOIN `users` u ON (
    SUBSTRING(u.name, 1, 1) = SUBSTRING(t.staff, 1, 1)
    AND t.staff LIKE CONCAT('%', SUBSTRING_INDEX(u.name, ' ', -1), '%')
)
SET t.staff_id = u.id
WHERE t.staff_id IS NULL;

-- Match pattern 3: If staff is a full name without abbreviation, direct match
UPDATE `transactions` t
INNER JOIN `users` u ON LOWER(TRIM(t.staff)) = LOWER(TRIM(u.name))
SET t.staff_id = u.id
WHERE t.staff_id IS NULL;

-- Step 3: For any remaining unmatched transactions, try fuzzy matching
-- This helps with variations in name formatting
UPDATE `transactions` t
INNER JOIN `users` u ON (
    REPLACE(LOWER(t.staff), '.', '') LIKE CONCAT('%', LOWER(SUBSTRING_INDEX(u.name, ' ', -1)), '%')
)
SET t.staff_id = u.id
WHERE t.staff_id IS NULL AND LENGTH(t.staff) > 0;

-- Step 4: Add index for better JOIN performance
ALTER TABLE `transactions`
ADD KEY `idx_tx_staff` (`staff_id`);

-- Step 5: Display summary of matched vs unmatched records
SELECT 
    COUNT(*) as total_transactions,
    SUM(CASE WHEN staff_id IS NOT NULL THEN 1 ELSE 0 END) as matched,
    SUM(CASE WHEN staff_id IS NULL THEN 1 ELSE 0 END) as unmatched
FROM `transactions`;

-- Step 6: Show unmatched transactions (if any) for manual review
SELECT id, staff, transacted_at 
FROM `transactions` 
WHERE staff_id IS NULL 
ORDER BY transacted_at DESC 
LIMIT 20;

-- Optional: Add foreign key constraint (comment out if you want to keep it loose)
-- ALTER TABLE `transactions`
-- ADD CONSTRAINT `fk_tx_staff` FOREIGN KEY (`staff_id`) REFERENCES `users`(`id`) ON DELETE SET NULL;

