-- Member accounts: visitors and owners sign in with WhatsApp OTP (users.role = 'owner'
-- covers both) and get an account area with their enquiries + replies, listings and
-- saved properties. Apply after 002_crm.sql:
--   mysql -h HOST -u USER -p DBNAME < db/migrations/003_accounts.sql

SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE users
  ADD COLUMN last_login_at DATETIME(3) NULL AFTER phone_verified_at;

-- Enquiries made by (or later claimed by) a signed-in member.
ALTER TABLE enquiries
  ADD COLUMN user_id CHAR(36) CHARACTER SET ascii NULL AFTER client_id,
  ADD KEY enquiries_user_idx (user_id, created_at),
  ADD CONSTRAINT enquiries_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;

-- Conversation on an enquiry: staff replies and the member's follow-ups.
CREATE TABLE enquiry_messages (
  id         CHAR(36)    CHARACTER SET ascii NOT NULL PRIMARY KEY,
  enquiry_id CHAR(36)    CHARACTER SET ascii NOT NULL,
  sender     ENUM('staff', 'member') NOT NULL,
  author_id  CHAR(36)    CHARACTER SET ascii NULL,
  body       TEXT        NOT NULL,
  read_at    DATETIME(3) NULL,  -- when the other side saw it
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY enquiry_messages_enquiry_idx (enquiry_id, created_at),
  CONSTRAINT enquiry_messages_enquiry_fk FOREIGN KEY (enquiry_id) REFERENCES enquiries (id) ON DELETE CASCADE,
  CONSTRAINT enquiry_messages_author_fk FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Shortlist.
CREATE TABLE saved_properties (
  user_id     CHAR(36)    CHARACTER SET ascii NOT NULL,
  property_id CHAR(36)    CHARACTER SET ascii NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, property_id),
  KEY saved_properties_property_idx (property_id),
  CONSTRAINT saved_properties_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT saved_properties_property_fk FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Existing enquiries from numbers that already have a member account.
UPDATE enquiries e JOIN users u ON u.phone = e.phone AND u.role = 'owner'
SET e.user_id = u.id
WHERE e.user_id IS NULL;
