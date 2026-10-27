-- Demo CRM data: agents and a partner broker, assigned clients with timelines and
-- follow-ups, enquiry conversations, and member accounts (a visitor with saved
-- properties). Apply after db/demo-workflow.sql and the migrations:
--   mysql -h HOST -u USER -p DBNAME < db/demo-crm.sql
-- Agents are created without passwords: set one from Admin → Agents & brokers, or use
-- "Forgot password" on the staff login. Safe to re-run.
-- Remove before launch:
--   DELETE FROM users WHERE id LIKE '00000000-0000-4000-8000-0000000000b_' AND role = 'agent';
--   DELETE FROM clients WHERE id LIKE '00000000-0000-4000-c100-%';
--   DELETE FROM users WHERE id = '00000000-0000-4000-8000-0000000000a5';
--   DELETE FROM site_verifications WHERE id = '00000000-0000-4000-c400-000000000001';

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET @now = UTC_TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- Agents & brokers
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO users (id, role, is_active, agent_type, name, email, work_phone, company, rera_no, commission_pct, notes, created_at) VALUES
  ('00000000-0000-4000-8000-0000000000b2', 'agent', 1, 'agent',  'Priya Shenoy',  'priya@brixora.in',  '919900011111', NULL, 'PRM/KA/RERA/1257/AG/0101', 1.00, 'Residential sales, Kadri–Bejai belt.', @now - INTERVAL 90 DAY),
  ('00000000-0000-4000-8000-0000000000b3', 'agent', 1, 'agent',  'Karthik Rai',   'karthik@brixora.in', '919900022222', NULL, NULL, 1.00, 'Rentals and commercial.', @now - INTERVAL 60 DAY),
  ('00000000-0000-4000-8000-0000000000b4', 'agent', 1, 'broker', 'Ashwin Mendon', NULL, '919900033333', 'Coastline Realty', 'PRM/KA/RERA/1257/AG/0442', 0.50, 'Co-broking partner for Surathkal / Mulki.', @now - INTERVAL 45 DAY);

-- Spread the website-enquiry clients across the agents and give them follow-ups.
UPDATE clients SET assigned_to = '00000000-0000-4000-8000-0000000000b2', status = 'contacted',
  next_follow_up = @now - INTERVAL 2 HOUR, last_contact_at = @now - INTERVAL 1 DAY,
  bedrooms = 3, budget_min = 7000000, budget_max = 9000000, localities = 'Kadri, Bejai', property_types = '["apartment"]'
  WHERE phone = '919845011111';
UPDATE clients SET assigned_to = '00000000-0000-4000-8000-0000000000b3', status = 'site_visit',
  next_follow_up = @now + INTERVAL 1 DAY, last_contact_at = @now - INTERVAL 3 HOUR,
  bedrooms = 2, budget_max = 25000, localities = 'Bejai, Kodialbail', property_types = '["apartment"]'
  WHERE phone = '919845022222';
UPDATE clients SET assigned_to = '00000000-0000-4000-8000-0000000000b3', type = 'tenant', listing_type = 'rent',
  next_follow_up = @now + INTERVAL 3 HOUR, property_types = '["office"]', budget_max = 160000, localities = 'Hampankatta'
  WHERE phone = '919845033333';
UPDATE clients SET assigned_to = '00000000-0000-4000-8000-0000000000b2', status = 'negotiation',
  next_follow_up = @now + INTERVAL 2 DAY, last_contact_at = @now - INTERVAL 2 DAY,
  bedrooms = 4, budget_min = 25000000, budget_max = 35000000, property_types = '["villa","independent_house"]'
  WHERE phone = '919845044444';
UPDATE clients SET status = 'won', next_follow_up = NULL, assigned_to = '00000000-0000-4000-8000-0000000000b2',
  broker_id = '00000000-0000-4000-8000-0000000000b4', notes = 'NRI buyer, deal closed via video walkthrough.'
  WHERE phone = '919845055555';
UPDATE clients SET status = 'lost', lost_reason = 'Found a flat through a relative', next_follow_up = NULL,
  assigned_to = '00000000-0000-4000-8000-0000000000b3'
  WHERE phone = '919845066666';
-- 919845077777 and 919845088888 stay unassigned and new, for the admin to hand out.

-- ---------------------------------------------------------------------------
-- Walk-in / phone / broker clients
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO clients (id, name, phone, email, type, status, source, listing_type, property_types, localities, bedrooms,
  budget_min, budget_max, notes, property_id, assigned_to, broker_id, next_follow_up, last_contact_at, created_by, created_at) VALUES
  ('00000000-0000-4000-c100-000000000001', 'Ganesh Acharya', '919811100001', 'ganesh.a@example.com', 'buyer', 'new', 'walk_in', 'sale',
   '["apartment"]', 'Kodialbail, Lalbagh', 3, 9000000, 13000000, 'Walked into the office, wants ready-to-move.', NULL,
   '00000000-0000-4000-8000-0000000000b2', NULL, @now + INTERVAL 5 HOUR, NULL, '00000000-0000-4000-8000-0000000000b2', @now - INTERVAL 1 DAY),
  ('00000000-0000-4000-c100-000000000002', 'Sowmya Bhandary', '919811100002', NULL, 'seller', 'contacted', 'phone', 'sale',
   '["independent_house"]', 'Urwa', NULL, NULL, NULL, 'Wants to sell her parents'' house in Urwa. Visit to photograph next week.', NULL,
   '00000000-0000-4000-8000-0000000000b2', NULL, @now - INTERVAL 1 DAY, @now - INTERVAL 4 DAY, '00000000-0000-4000-8000-0000000000b2', @now - INTERVAL 6 DAY),
  ('00000000-0000-4000-c100-000000000003', 'Mohammed Arif', '919811100003', NULL, 'investor', 'negotiation', 'broker', 'sale',
   '["plot"]', 'Surathkal, Mulki', NULL, 4000000, 8000000, 'Looking for plots near NITK for rental cottages.', '00000000-0000-4000-8000-000000000005',
   '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000b4', @now + INTERVAL 1 DAY, @now - INTERVAL 1 DAY, '00000000-0000-4000-8000-0000000000b2', @now - INTERVAL 15 DAY),
  ('00000000-0000-4000-c100-000000000004', 'Deepa & Vinay Pai', '919811100004', NULL, 'tenant', 'new', 'whatsapp', 'rent',
   '["apartment"]', 'Kadri', 2, 15000, 22000, 'Moving from Bengaluru in December.', NULL,
   NULL, NULL, NULL, NULL, NULL, @now - INTERVAL 3 HOUR),
  ('00000000-0000-4000-c100-000000000005', 'Ramesh Kotian', '919811100005', NULL, 'landlord', 'won', 'referral', 'rent',
   '["shop"]', 'Falnir', NULL, NULL, NULL, 'Listed his Falnir showroom with us.', '00000000-0000-4000-8000-000000000008',
   '00000000-0000-4000-8000-0000000000b3', NULL, NULL, @now - INTERVAL 20 DAY, '00000000-0000-4000-8000-0000000000b3', @now - INTERVAL 40 DAY);

-- ---------------------------------------------------------------------------
-- Timelines
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO client_activities (id, client_id, type, body, property_id, actor_id, created_at) VALUES
  ('00000000-0000-4000-c200-000000000001', (SELECT id FROM clients WHERE phone = '919845011111'), 'call',
   'Spoke for 10 min. Budget firm at 85–90 L, wants east-facing. Sending two more options.', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', @now - INTERVAL 1 DAY),
  ('00000000-0000-4000-c200-000000000002', (SELECT id FROM clients WHERE phone = '919845022222'), 'site_visit',
   'Visited the Bejai flat with family. Liked it, asking if the owner will reduce to 20k.', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000b3', @now - INTERVAL 3 HOUR),
  ('00000000-0000-4000-c200-000000000003', (SELECT id FROM clients WHERE phone = '919845044444'), 'meeting',
   'Met at the office. Shortlisted the Derebail villa; second visit with parents on Sunday.', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000b2', @now - INTERVAL 2 DAY),
  ('00000000-0000-4000-c200-000000000004', '00000000-0000-4000-c100-000000000001', 'note',
   'Walk-in. Prefers 3 BHK near schools, ready to move.', NULL, '00000000-0000-4000-8000-0000000000b2', @now - INTERVAL 1 DAY),
  ('00000000-0000-4000-c200-000000000005', '00000000-0000-4000-c100-000000000002', 'call',
   'Discussed expected price (~95 L). She will share the khata and tax receipts.', NULL, '00000000-0000-4000-8000-0000000000b2', @now - INTERVAL 4 DAY),
  ('00000000-0000-4000-c200-000000000006', '00000000-0000-4000-c100-000000000003', 'site_visit',
   'Walked the Surathkal plot with Ashwin (broker). Offered 55 L; owner asking 60 L.', '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-0000000000b2', @now - INTERVAL 1 DAY),
  ('00000000-0000-4000-c200-000000000007', '00000000-0000-4000-c100-000000000005', 'status',
   'Negotiation → Won', NULL, '00000000-0000-4000-8000-0000000000b3', @now - INTERVAL 20 DAY);

-- ---------------------------------------------------------------------------
-- Member accounts
-- ---------------------------------------------------------------------------
-- A visitor (no listings) who made enquiries and saved properties.
INSERT IGNORE INTO users (id, role, name, phone, email, phone_verified_at, last_login_at, created_at) VALUES
  ('00000000-0000-4000-8000-0000000000a5', 'owner', 'Divya Nayak', '919845022222', 'divya.n@example.com',
   @now - INTERVAL 3 DAY, @now - INTERVAL 2 HOUR, @now - INTERVAL 3 DAY);
UPDATE users SET last_login_at = @now - INTERVAL 1 DAY WHERE id IN ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a3');
UPDATE users SET last_login_at = @now - INTERVAL 5 DAY WHERE id IN ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a4');

UPDATE enquiries SET user_id = '00000000-0000-4000-8000-0000000000a5' WHERE phone = '919845022222';

INSERT IGNORE INTO saved_properties (user_id, property_id, created_at) VALUES
  ('00000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-000000000002', @now - INTERVAL 3 DAY),
  ('00000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-000000000010', @now - INTERVAL 2 DAY),
  ('00000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-a000-000000000034', @now - INTERVAL 1 DAY),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000009', @now - INTERVAL 4 DAY);

-- Conversation on her enquiry: our reply, then her follow-up (unread by staff).
INSERT IGNORE INTO enquiry_messages (id, enquiry_id, sender, author_id, body, read_at, created_at) VALUES
  ('00000000-0000-4000-c300-000000000001', '00000000-0000-4000-e000-000000000002', 'staff', '00000000-0000-4000-8000-0000000000b3',
   'Hi Divya, yes it is available from the 15th. The owner prefers a family. Shall we fix a visit tomorrow at 5 pm?', @now - INTERVAL 150 MINUTE, @now - INTERVAL 160 MINUTE),
  ('00000000-0000-4000-c300-000000000002', '00000000-0000-4000-e000-000000000002', 'member', '00000000-0000-4000-8000-0000000000a5',
   'Thanks! We visited today and liked it. Can the owner do 20,000 if we sign for 2 years?', NULL, @now - INTERVAL 40 MINUTE),
  -- A reply on a guest enquiry (they'll see it once they sign up with that number).
  ('00000000-0000-4000-c300-000000000003', '00000000-0000-4000-e000-000000000001', 'staff', '00000000-0000-4000-8000-0000000000b2',
   'Hello Prakash, the price has a little room. I have shared two similar options on WhatsApp too.', NULL, @now - INTERVAL 20 MINUTE);

-- ---------------------------------------------------------------------------
-- On-site verification (needs migration 004): a visit booked for tomorrow.
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO site_verifications (id, property_id, status, scheduled_at, assigned_to, notes, created_at) VALUES
  ('00000000-0000-4000-c400-000000000001', '00000000-0000-4000-a000-000000000025', 'scheduled', @now + INTERVAL 1 DAY,
   '00000000-0000-4000-8000-0000000000b2', 'Owner will meet at the gate. Check parking and water supply.', @now - INTERVAL 1 HOUR);
