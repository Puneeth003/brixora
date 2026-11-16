-- Seller submission: map pin, optional ownership documents, and the seller's consent.
--   * latitude / longitude: the pin the owner drops on the map. Private like the address:
--     never in the public views; the auditor's GPS is compared with it on the site visit.
--   * owner_consent_at / owner_consent_version: when the owner confirmed they may list the
--     property and that the brokerage handles every enquiry, and which wording they saw.
--   * property_documents: sale deed, khata, RTC, etc. Optional for the owner. Stored
--     privately (documents/ area) and shown only to admins and the assigned auditor, who
--     accept or reject each one.
-- Apply after 008_auditor_flow.sql:
--   mysql -h HOST -u USER -p DBNAME < db/migrations/009_location_documents_consent.sql

SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE properties
  ADD COLUMN latitude              DECIMAL(9, 6) NULL AFTER private_landmark,
  ADD COLUMN longitude             DECIMAL(9, 6) NULL AFTER latitude,
  ADD COLUMN owner_consent_at      DATETIME(3)   NULL AFTER submitted_at,
  ADD COLUMN owner_consent_version VARCHAR(20)   NULL AFTER owner_consent_at;

CREATE TABLE property_documents (
  id            CHAR(36)     CHARACTER SET ascii NOT NULL PRIMARY KEY,
  property_id   CHAR(36)     CHARACTER SET ascii NOT NULL,
  doc_type      ENUM('sale_deed', 'khata', 'rtc', 'encumbrance', 'tax_receipt', 'rera', 'rental_agreement', 'id_proof', 'other') NOT NULL,
  storage_path  VARCHAR(120) CHARACTER SET ascii NOT NULL,
  original_name VARCHAR(160) NULL,
  mime_type     VARCHAR(60)  CHARACTER SET ascii NOT NULL,
  size_bytes    INT          NOT NULL,
  status        ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
  review_note   VARCHAR(500) NULL,
  reviewed_by   CHAR(36)     CHARACTER SET ascii NULL,
  reviewed_at   DATETIME(3)  NULL,
  uploaded_by   CHAR(36)     CHARACTER SET ascii NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY property_documents_property_idx (property_id, created_at),
  CONSTRAINT property_documents_property_fk FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT property_documents_reviewer_fk FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT property_documents_uploader_fk FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
