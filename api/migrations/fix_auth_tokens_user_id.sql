-- Fix auth token storage so user IDs match the varchar-based user IDs (e.g. U101)
-- This prevents bearer tokens from being bound to user_id = 0 and causing 401/403 login issues.

DELETE FROM auth_tokens WHERE user_id = 0 OR user_id = '';
ALTER TABLE auth_tokens MODIFY user_id VARCHAR(20) NOT NULL;
