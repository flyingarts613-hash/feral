-- The primary admin can be managed from environment variables (ADMIN_LOGIN_ID +
-- ADMIN_PASSWORD_HASH / ADMIN_PASSWORD): on every start the server creates or
-- updates that account and disables it again if the variables are removed.
-- Only the scrypt hash is ever stored.
ALTER TABLE admins ADD COLUMN managed_by text CHECK (managed_by IN ('env'));
