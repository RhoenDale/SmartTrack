-- Back up the smarttrack database before applying this migration.
-- Ensure create_roles_table.sql has been applied first.
--
-- Keep users.role as the user's primary/legacy role. This table stores the
-- complete role assignment and is backfilled without changing existing users.

CREATE TABLE IF NOT EXISTS user_roles (
  user_id VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  role_id VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (user_id, role_id),
  KEY idx_user_roles_role_id (role_id),
  CONSTRAINT fk_user_roles_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role
    FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO user_roles (user_id, role_id)
SELECT u.id, u.role
FROM users u
INNER JOIN roles r ON r.id = u.role;
