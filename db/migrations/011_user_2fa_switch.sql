-- Two-factor sign-in on/off per staff user (Admin → Users → user → Two-factor sign-in).
-- Replaces the workspace-wide ADMIN_2FA variable: admins decide for each admin / agent
-- whether the authenticator code is required. On for everyone by default.
-- Apply after 010_broadcasts.sql:
--   mysql -h HOST -u USER -p DBNAME < db/migrations/011_user_2fa_switch.sql

SET NAMES utf8mb4;

ALTER TABLE users
  ADD COLUMN mfa_required TINYINT(1) NOT NULL DEFAULT 1 AFTER totp_last_step;
