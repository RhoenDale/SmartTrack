-- Normalize legacy product categories into the product/category link table.
-- Composite values separated by "/" (for example "Vitamin / Supplement") become
-- separate category assignments. Run once before deploying the normalized app.

CREATE TABLE IF NOT EXISTS `product_category_map` (
  `product_id`   INT UNSIGNED NOT NULL,
  `category_id`  INT          NOT NULL,
  PRIMARY KEY (`product_id`, `category_id`),
  KEY `idx_product_category_category` (`category_id`),
  CONSTRAINT `fk_product_category_product`
    FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_product_category_category`
    FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

DROP TEMPORARY TABLE IF EXISTS `tmp_product_category_parts`;
CREATE TEMPORARY TABLE `tmp_product_category_parts` (
  `product_id` INT UNSIGNED NOT NULL,
  `name`       VARCHAR(80) NOT NULL,
  PRIMARY KEY (`product_id`, `name`)
) ENGINE=InnoDB;

INSERT IGNORE INTO `tmp_product_category_parts` (`product_id`, `name`)
WITH RECURSIVE category_parts AS (
  SELECT
    `id` AS product_id,
    TRIM(SUBSTRING_INDEX(`category`, '/', 1)) AS name,
    CASE
      WHEN LOCATE('/', `category`) > 0
      THEN SUBSTRING(`category`, LOCATE('/', `category`) + 1)
      ELSE ''
    END AS remaining
  FROM `products`
  WHERE TRIM(COALESCE(`category`, '')) <> ''

  UNION ALL

  SELECT
    product_id,
    TRIM(SUBSTRING_INDEX(remaining, '/', 1)) AS name,
    CASE
      WHEN LOCATE('/', remaining) > 0
      THEN SUBSTRING(remaining, LOCATE('/', remaining) + 1)
      ELSE ''
    END AS remaining
  FROM category_parts
  WHERE remaining <> ''
)
SELECT product_id, name
FROM category_parts
WHERE name <> '';

INSERT INTO `categories` (`name`)
SELECT DISTINCT parts.`name`
FROM `tmp_product_category_parts` parts
WHERE NOT EXISTS (
  SELECT 1 FROM `categories` c WHERE c.`name` = parts.`name`
);

DELETE pcm
FROM `product_category_map` pcm
JOIN `categories` c ON c.id = pcm.category_id
WHERE c.name LIKE '%/%';

INSERT IGNORE INTO `product_category_map` (`product_id`, `category_id`)
SELECT parts.product_id, categories.id
FROM `tmp_product_category_parts` parts
JOIN `categories` ON categories.name = parts.name;

-- Remove old composite labels once products point to their normalized categories.
DELETE c
FROM `categories` c
LEFT JOIN `product_category_map` pcm ON pcm.category_id = c.id
WHERE c.name LIKE '%/%' AND pcm.category_id IS NULL;

DROP TEMPORARY TABLE `tmp_product_category_parts`;

SET @drop_legacy_product_category = IF(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'products'
      AND column_name = 'category'
  ),
  'ALTER TABLE `products` DROP COLUMN `category`',
  'SELECT 1'
);
PREPARE drop_legacy_category_stmt FROM @drop_legacy_product_category;
EXECUTE drop_legacy_category_stmt;
DEALLOCATE PREPARE drop_legacy_category_stmt;
