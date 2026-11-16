-- Two-step approval: a field auditor verifies the property on site, then a different
-- admin gives the final approval.
--   * Auditors are staff with role = 'agent' and agent_type = 'auditor'. They see their
--     own site visits (and the agent CRM), and are offered first when scheduling a visit.
--   * archived_from remembers which status a listing was archived from, so "Put back on
--     website" can only return it there (a rejected or sold listing never goes live this way).
--   * The require_site_verification setting is gone: an on-site verification is always
--     needed before approval.
-- Apply after 007_keep_activity_history.sql:
--   mysql -h HOST -u USER -p DBNAME < db/migrations/008_auditor_flow.sql

SET NAMES utf8mb4;
SET time_zone = '+00:00';

ALTER TABLE users
  MODIFY agent_type ENUM('agent', 'broker', 'auditor') NULL;

ALTER TABLE properties
  ADD COLUMN archived_from ENUM('pending', 'under_review', 'approved', 'rejected', 'sold_pending', 'sold', 'expired') NULL AFTER status;

-- Existing archived listings came from the live site.
UPDATE properties SET archived_from = 'approved' WHERE status = 'archived' AND archived_from IS NULL;

DELETE FROM app_config WHERE name = 'require_site_verification';
