-- Back up the smarttrack database before applying this migration.
-- Run this check first and resolve every orphan before continuing:
-- SELECT u.id, u.role
-- FROM users u
-- LEFT JOIN roles r ON r.id = u.role
-- WHERE r.id IS NULL;
--
-- Apply create_roles_table.sql first if the roles table does not exist.
-- This migration does not rewrite user role values.

ALTER TABLE users
  MODIFY COLUMN role VARCHAR(50)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  ADD CONSTRAINT fk_users_role
    FOREIGN KEY (role) REFERENCES roles (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;
