-- Stores API activity centrally so admins can review actions across all users
-- and devices. Payloads, credentials, and query-string values are not stored.

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id VARCHAR(20) NULL,
  actor_name VARCHAR(120) NOT NULL,
  method VARCHAR(10) NOT NULL,
  request_path VARCHAR(500) NOT NULL,
  response_status SMALLINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_activity_logs_actor_id (actor_user_id, id),
  KEY idx_activity_logs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
