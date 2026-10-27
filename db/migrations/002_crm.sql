-- CRM: agents & brokers (staff users), clients, client activity, password resets.
-- Apply once, after db/schema.sql (fresh installs run schema.sql, then every file in
-- db/migrations in order):
--   mysql -h HOST -u USER -p DBNAME < db/migrations/002_crm.sql

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- Staff accounts: 'admin' (full access) and 'agent' (CRM, own clients only).
-- Outside brokers are agents with agent_type = 'broker'; without an email or
-- password they are just records and can't sign in.
ALTER TABLE users
  MODIFY role ENUM('admin', 'agent', 'owner') NOT NULL DEFAULT 'owner',
  ADD COLUMN is_active      TINYINT(1)    NOT NULL DEFAULT 1 AFTER role,
  ADD COLUMN agent_type     ENUM('agent', 'broker') NULL AFTER is_active,
  ADD COLUMN work_phone     VARCHAR(20)   NULL AFTER email,
  ADD COLUMN company        VARCHAR(120)  NULL AFTER work_phone,
  ADD COLUMN rera_no        VARCHAR(80)   NULL AFTER company,
  ADD COLUMN commission_pct DECIMAL(5, 2) NULL AFTER rera_no,
  ADD COLUMN notes          TEXT          NULL AFTER commission_pct,
  ADD COLUMN password_changed_at DATETIME(3) NULL AFTER password_hash;

CREATE TABLE clients (
  id             CHAR(36)     CHARACTER SET ascii NOT NULL PRIMARY KEY,
  name           VARCHAR(120) NOT NULL,
  phone          VARCHAR(20)  CHARACTER SET ascii NOT NULL,  -- 91XXXXXXXXXX
  alt_phone      VARCHAR(20)  NULL,
  email          VARCHAR(254) NULL,
  type           ENUM('buyer', 'tenant', 'seller', 'landlord', 'investor') NOT NULL DEFAULT 'buyer',
  status         ENUM('new', 'contacted', 'site_visit', 'negotiation', 'won', 'lost') NOT NULL DEFAULT 'new',
  source         ENUM('website', 'walk_in', 'referral', 'phone', 'whatsapp', 'broker', 'social', 'other') NOT NULL DEFAULT 'other',
  listing_type   ENUM('sale', 'rent') NULL,
  property_types JSON         NOT NULL,
  localities     VARCHAR(255) NULL,
  bedrooms       SMALLINT     NULL,
  budget_min     BIGINT       NULL,
  budget_max     BIGINT       NULL,
  notes          TEXT         NULL,
  lost_reason    VARCHAR(255) NULL,
  property_id    CHAR(36)     CHARACTER SET ascii NULL,  -- listing they're interested in / selling
  assigned_to    CHAR(36)     CHARACTER SET ascii NULL,  -- agent
  broker_id      CHAR(36)     CHARACTER SET ascii NULL,  -- referring broker
  next_follow_up DATETIME(3)  NULL,
  last_contact_at DATETIME(3) NULL,
  created_by     CHAR(36)     CHARACTER SET ascii NULL,
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY clients_phone_uq (phone),
  KEY clients_status_idx (status),
  KEY clients_assigned_idx (assigned_to, status),
  KEY clients_follow_up_idx (next_follow_up),
  CONSTRAINT clients_property_fk FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE SET NULL,
  CONSTRAINT clients_assigned_fk FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT clients_broker_fk FOREIGN KEY (broker_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT clients_creator_fk FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE client_activities (
  id          CHAR(36)    CHARACTER SET ascii NOT NULL PRIMARY KEY,
  client_id   CHAR(36)    CHARACTER SET ascii NOT NULL,
  type        ENUM('note', 'call', 'whatsapp', 'email', 'meeting', 'site_visit', 'status', 'assigned', 'enquiry') NOT NULL,
  body        TEXT        NULL,
  property_id CHAR(36)    CHARACTER SET ascii NULL,
  actor_id    CHAR(36)    CHARACTER SET ascii NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY client_activities_client_idx (client_id, created_at),
  CONSTRAINT client_activities_client_fk FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE,
  CONSTRAINT client_activities_property_fk FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE SET NULL,
  CONSTRAINT client_activities_actor_fk FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Password reset codes for staff (emailed). Stored as an HMAC, never in plain text.
-- After the code is verified, a one-time reset token (also hashed) authorises the
-- new password.
CREATE TABLE password_resets (
  id          CHAR(36)    CHARACTER SET ascii NOT NULL PRIMARY KEY,
  user_id     CHAR(36)    CHARACTER SET ascii NOT NULL,
  code_hash   CHAR(64)    CHARACTER SET ascii NOT NULL,
  token_hash  CHAR(64)    CHARACTER SET ascii NULL,
  attempts    INT         NOT NULL DEFAULT 0,
  used_at     DATETIME(3) NULL,
  expires_at  DATETIME(3) NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY password_resets_user_idx (user_id, created_at),
  CONSTRAINT password_resets_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Enquiries are linked to the client they created or updated.
ALTER TABLE enquiries
  ADD COLUMN client_id CHAR(36) CHARACTER SET ascii NULL AFTER property_id,
  ADD KEY enquiries_client_idx (client_id),
  ADD CONSTRAINT enquiries_client_fk FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL;

-- Backfill: one client per enquiry phone number, with each enquiry on its timeline.
INSERT INTO clients (id, name, phone, type, status, source, property_types, created_at)
SELECT UUID(), MIN(e.name), e.phone, 'buyer', 'new', 'website', '[]', MIN(e.created_at)
FROM enquiries e
GROUP BY e.phone;

UPDATE enquiries e JOIN clients c ON c.phone = e.phone SET e.client_id = c.id;

UPDATE clients c
JOIN enquiries e ON e.client_id = c.id AND e.created_at = c.created_at
LEFT JOIN properties p ON p.id = e.property_id
SET c.property_id = e.property_id,
    c.type = IF(p.listing_type = 'rent', 'tenant', 'buyer'),
    c.listing_type = p.listing_type;

INSERT INTO client_activities (id, client_id, type, body, property_id, created_at)
SELECT UUID(), e.client_id, 'enquiry', e.message, e.property_id, e.created_at
FROM enquiries e
WHERE e.client_id IS NOT NULL;
