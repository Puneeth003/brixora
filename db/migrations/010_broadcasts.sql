-- WhatsApp broadcasts (Admin → Broadcasts): one approved Meta template sent to a list of
-- people (CRM clients, website members, enquiries, or an uploaded / pasted list).
--   * broadcasts: the campaign: template, variables, audience description, schedule.
--   * broadcast_recipients: one row per number, with its own variables and delivery
--     status (updated by the WhatsApp webhook), and when they replied.
--   * wa_optouts: numbers that replied STOP (or were added by an admin). They never get
--     broadcasts, whether or not they have a website account.
-- Apply after 009_location_documents_consent.sql:
--   mysql -h HOST -u USER -p DBNAME < db/migrations/010_broadcasts.sql

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS broadcasts (
  id                CHAR(36)     CHARACTER SET ascii NOT NULL PRIMARY KEY,
  name              VARCHAR(120) NOT NULL,
  template_name     VARCHAR(512) NOT NULL,
  template_lang     VARCHAR(16)  NOT NULL,
  template_category VARCHAR(32)  NULL,
  config            JSON         NOT NULL,  -- { body, header, footer, buttons, headerMedia, variables }
  audience          JSON         NOT NULL,  -- the audience spec, for the report
  status            ENUM('scheduled', 'sending', 'paused', 'done', 'cancelled') NOT NULL DEFAULT 'scheduled',
  scheduled_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  started_at        DATETIME(3)  NULL,
  finished_at       DATETIME(3)  NULL,
  created_by        CHAR(36)     CHARACTER SET ascii NULL,
  created_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY broadcasts_due_idx (status, scheduled_at),
  KEY broadcasts_created_idx (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  broadcast_id  CHAR(36)     CHARACTER SET ascii NOT NULL,
  phone         VARCHAR(20)  CHARACTER SET ascii NOT NULL,
  name          VARCHAR(120) NULL,
  params        JSON         NOT NULL,  -- { body: string[], header: string[] }
  status        ENUM('pending', 'sending', 'sent', 'delivered', 'read', 'failed', 'skipped') NOT NULL DEFAULT 'pending',
  wa_message_id VARCHAR(128) NULL,
  error         TEXT         NULL,
  claim         CHAR(36)     CHARACTER SET ascii NULL,
  claimed_at    DATETIME(3)  NULL,
  sent_at       DATETIME(3)  NULL,
  replied_at    DATETIME(3)  NULL,
  updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY broadcast_recipients_uq (broadcast_id, phone),
  KEY broadcast_recipients_status_idx (broadcast_id, status),
  KEY broadcast_recipients_claim_idx (claim),
  KEY broadcast_recipients_wa_idx (wa_message_id),
  KEY broadcast_recipients_phone_idx (phone, sent_at),
  CONSTRAINT broadcast_recipients_fk FOREIGN KEY (broadcast_id) REFERENCES broadcasts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wa_optouts (
  phone      VARCHAR(20) CHARACTER SET ascii NOT NULL PRIMARY KEY,
  source     ENUM('reply', 'admin') NOT NULL DEFAULT 'reply',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
