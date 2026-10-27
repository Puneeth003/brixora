-- On-site verification: a staff member visits the property, works through a checklist,
-- records GPS and proof photos, and marks it verified (or issues found). Approval can
-- require a verified visit (app_config require_site_verification = '1').
-- Apply after 003_accounts.sql:
--   mysql -h HOST -u USER -p DBNAME < db/migrations/004_site_verification.sql

SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE properties
  ADD COLUMN verified_at DATETIME(3) NULL AFTER approved_at,
  ADD COLUMN verified_by CHAR(36) CHARACTER SET ascii NULL AFTER verified_at,
  ADD CONSTRAINT properties_verifier_fk FOREIGN KEY (verified_by) REFERENCES users (id) ON DELETE SET NULL;

CREATE TABLE site_verifications (
  id                  CHAR(36)      CHARACTER SET ascii NOT NULL PRIMARY KEY,
  property_id         CHAR(36)      CHARACTER SET ascii NOT NULL,
  status              ENUM('scheduled', 'completed', 'cancelled') NOT NULL DEFAULT 'scheduled',
  result              ENUM('verified', 'issues') NULL,
  scheduled_at        DATETIME(3)   NULL,
  assigned_to         CHAR(36)      CHARACTER SET ascii NULL,
  visited_at          DATETIME(3)   NULL,
  checklist           JSON          NULL,  -- {"owner_met": true, ...}
  notes               TEXT          NULL,
  latitude            DECIMAL(9, 6) NULL,
  longitude           DECIMAL(9, 6) NULL,
  location_accuracy_m INT           NULL,
  created_by          CHAR(36)      CHARACTER SET ascii NULL,
  created_at          DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY site_verifications_property_idx (property_id, created_at),
  KEY site_verifications_assigned_idx (assigned_to, status, scheduled_at),
  CONSTRAINT site_verifications_property_fk FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT site_verifications_assigned_fk FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT site_verifications_creator_fk FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Proof photos taken on the visit. Private: served only to staff.
CREATE TABLE site_verification_photos (
  id              CHAR(36)     CHARACTER SET ascii NOT NULL PRIMARY KEY,
  verification_id CHAR(36)     CHARACTER SET ascii NOT NULL,
  storage_path    VARCHAR(255) NOT NULL,
  uploaded_by     CHAR(36)     CHARACTER SET ascii NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY site_verification_photos_idx (verification_id),
  CONSTRAINT site_verification_photos_fk FOREIGN KEY (verification_id) REFERENCES site_verifications (id) ON DELETE CASCADE,
  CONSTRAINT site_verification_photos_uploader_fk FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO app_config (name, value) VALUES ('require_site_verification', '1');

-- Expose the verified date on the public view (for the "Verified on site" badge).
CREATE OR REPLACE VIEW public_properties AS
SELECT
  p.id,
  p.reference_no,
  p.listing_type,
  p.property_type,
  p.title,
  p.description,
  p.price,
  p.price_negotiable,
  p.locality,
  p.city,
  p.bedrooms,
  p.bathrooms,
  p.area_sqft,
  p.furnishing,
  p.floor,
  p.property_age,
  p.available_from,
  p.amenities,
  p.rera_no,
  p.featured,
  p.approved_at,
  p.verified_at,
  p.updated_at,
  b.name AS builder_name,
  b.rera_no AS builder_rera_no,
  pr.name AS project_name,
  pr.rera_no AS project_rera_no,
  (
    SELECT i.watermarked_path
    FROM property_images i
    WHERE i.property_id = p.id AND i.is_visible = 1 AND i.approved = 1
    ORDER BY i.is_cover DESC, i.sort_order, i.created_at
    LIMIT 1
  ) AS cover_path
FROM properties p
LEFT JOIN builders b ON b.id = p.builder_id
LEFT JOIN projects pr ON pr.id = p.project_id
WHERE p.status = 'approved' AND (p.expires_at IS NULL OR p.expires_at > UTC_TIMESTAMP(3));

-- Listings that were live before this feature keep showing as live; mark the demo
-- ones verified on their approval date so the badge shows (remove for real data).
UPDATE properties SET verified_at = approved_at WHERE status = 'approved' AND verified_at IS NULL AND owner_id LIKE '00000000-0000-4000-8000-0000000000a_';
