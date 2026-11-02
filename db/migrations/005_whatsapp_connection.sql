-- WhatsApp Business app coexistence: the number connected through Embedded Signup in
-- Settings → WhatsApp is stored in app_config (wa_token is AES-256-GCM encrypted). Its
-- ciphertext is longer than 255 characters, so the value column becomes TEXT.
-- Apply after 004_site_verification.sql:
--   mysql -h HOST -u USER -p DBNAME < db/migrations/005_whatsapp_connection.sql

SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE app_config MODIFY value TEXT NOT NULL;
