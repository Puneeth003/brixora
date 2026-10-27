-- Demo workflow data for the admin panel: submissions in every state, change requests,
-- enquiries, WhatsApp message log and activity. Apply after db/seed.sql:
--   mysql -h HOST -u USER -p DBNAME < db/demo-workflow.sql
-- Dates are relative to now, so the dashboard always looks current. Safe to re-run.
-- Remove before launch:
--   DELETE FROM properties WHERE owner_id LIKE '00000000-0000-4000-8000-0000000000a_';
--   DELETE FROM users WHERE id LIKE '00000000-0000-4000-8000-0000000000a_';
--   DELETE FROM enquiries WHERE id LIKE '00000000-0000-4000-e000-%';
--   DELETE FROM messages WHERE id LIKE '00000000-0000-4000-f000-%';

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET @now = UTC_TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- Demo owners
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO users (id, role, name, phone, phone_verified_at, created_at) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'owner', 'Anitha Shetty',  '919999900001', @now - INTERVAL 20 DAY, @now - INTERVAL 20 DAY),
  ('00000000-0000-4000-8000-0000000000a2', 'owner', 'Rahul Kamath',   '919999900002', @now - INTERVAL 12 DAY, @now - INTERVAL 12 DAY),
  ('00000000-0000-4000-8000-0000000000a3', 'owner', 'Fathima Rizwan', '919999900003', @now - INTERVAL 6 DAY,  @now - INTERVAL 6 DAY),
  ('00000000-0000-4000-8000-0000000000a4', 'owner', 'Sandeep Pai',    '919999900004', @now - INTERVAL 40 DAY, @now - INTERVAL 40 DAY);

-- ---------------------------------------------------------------------------
-- Properties in each workflow state (BRX-2026-0025 … 0034)
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO properties (id, reference_no, status, listing_type, property_type, title, description, price, price_negotiable,
  locality, city, private_address, private_landmark, bedrooms, bathrooms, area_sqft, furnishing, floor, property_age, available_from,
  amenities, featured, owner_id, submitted_at, approved_at, expires_at, sold_at, rejected_reason, original_submission, created_at)
VALUES
  -- Pending review (oldest first in the queue)
  ('00000000-0000-4000-a000-000000000025', 'BRX-2026-0025', 'pending', 'sale', 'apartment',
   '3 BHK sea-facing flat in Bejai New Road',
   'Corner unit on the 9th floor with sea and sunset views from the living room and master bedroom. Covered parking, 24x7 security and a rooftop garden. Call 98450 12345 for a visit.',
   9200000, 1, 'Bejai', 'Mangalore', 'Flat 902, Sea Breeze Apartments, Bejai New Road', 'Opp. Bejai church', 3, 3, 1720, 'semi_furnished', '9 of 12', '3 years', NULL,
   '["Car parking","Lift","Power backup","Security","CCTV"]', 0, '00000000-0000-4000-8000-0000000000a1',
   @now - INTERVAL 3 DAY, NULL, NULL, NULL, NULL, '{"title":"3 BHK sea-facing flat in Bejai New Road","price":9200000}', @now - INTERVAL 3 DAY),
  ('00000000-0000-4000-a000-000000000026', 'BRX-2026-0026', 'pending', 'rent', 'independent_house',
   '2 BHK independent house with garden in Kadri Hills',
   'Quiet lane, tiled roof house with a small garden and well water. Suits a family; pets allowed. Available from next month.',
   21000, 1, 'Kadri', 'Mangalore', '4-56, Kadri Hills Road', 'Near Kadri Park gate 2', 2, 2, 1250, 'unfurnished', 'Ground', '15 years', DATE(@now + INTERVAL 20 DAY),
   '["Car parking","Garden","Borewell"]', 0, '00000000-0000-4000-8000-0000000000a2',
   @now - INTERVAL 30 HOUR, NULL, NULL, NULL, NULL, '{"title":"2 BHK independent house with garden in Kadri Hills","price":21000}', @now - INTERVAL 30 HOUR),
  ('00000000-0000-4000-a000-000000000027', 'BRX-2026-0027', 'pending', 'sale', 'plot',
   '10 cents corner plot in Thokottu',
   'DC-converted residential corner plot, 30 ft road on two sides, clear title, near the national highway and Yenepoya hospital.',
   4500000, 1, 'Thokottu', 'Mangalore', 'Sy. No. 112/3, Thokottu', 'Behind Thokottu bus stand', NULL, NULL, 4356, NULL, NULL, NULL, NULL,
   '[]', 0, '00000000-0000-4000-8000-0000000000a3',
   @now - INTERVAL 5 HOUR, NULL, NULL, NULL, NULL, '{"title":"10 cents corner plot in Thokottu","price":4500000}', @now - INTERVAL 5 HOUR),
  -- Under review
  ('00000000-0000-4000-a000-000000000028', 'BRX-2026-0028', 'under_review', 'rent', 'office',
   'Office space near Lalbagh with 15 workstations',
   'Furnished office of 1,100 sq.ft with 15 workstations, one cabin and a pantry. Lift, power backup and two car parks.',
   55000, 0, 'Lalbagh', 'Mangalore', '3rd floor, Crystal Arcade, Lalbagh', NULL, NULL, 1, 1100, 'fully_furnished', '3 of 5', '6 years', NULL,
   '["Car parking","Lift","Power backup","CCTV"]', 0, '00000000-0000-4000-8000-0000000000a4',
   @now - INTERVAL 4 DAY, NULL, NULL, NULL, NULL, '{"title":"Office space near Lalbagh with 15 workstations","price":55000}', @now - INTERVAL 4 DAY),
  -- Rejected
  ('00000000-0000-4000-a000-000000000029', 'BRX-2026-0029', 'rejected', 'sale', 'apartment',
   'Flat for sale',
   'Good flat. Contact owner.',
   3000000, 1, 'Kulshekar', 'Mangalore', 'Kulshekar', NULL, 2, 1, 800, 'unfurnished', NULL, NULL, NULL,
   '[]', 0, '00000000-0000-4000-8000-0000000000a2',
   @now - INTERVAL 8 DAY, NULL, NULL, NULL,
   'Please add a clear title, a proper description (at least a few lines about the flat and building) and photos of the rooms.',
   '{"title":"Flat for sale","price":3000000}', @now - INTERVAL 8 DAY),
  -- Owner said "sold"; waiting for admin confirmation
  ('00000000-0000-4000-a000-000000000030', 'BRX-2026-0030', 'sold_pending', 'sale', 'villa',
   '4 BHK villa with pool in Kottara',
   'Contemporary villa with private pool, home theatre and landscaped garden on 9 cents.',
   27500000, 1, 'Kottara', 'Mangalore', 'Villa 7, Palm Grove Layout, Kottara', NULL, 4, 5, 3400, 'fully_furnished', NULL, '2 years', NULL,
   '["Car parking","Swimming pool","Garden","Power backup","Security"]', 0, '00000000-0000-4000-8000-0000000000a4',
   @now - INTERVAL 35 DAY, @now - INTERVAL 33 DAY, @now + INTERVAL 57 DAY, NULL, NULL, NULL, @now - INTERVAL 35 DAY),
  -- Sold
  ('00000000-0000-4000-a000-000000000031', 'BRX-2026-0031', 'sold', 'sale', 'apartment',
   '2 BHK in Kankanady, walk to Father Muller',
   'Well-kept 2 BHK on the 2nd floor, east facing, with covered parking.',
   5100000, 1, 'Kankanady', 'Mangalore', 'Flat 204, Muller Residency', NULL, 2, 2, 1050, 'semi_furnished', '2 of 4', '7 years', NULL,
   '["Car parking","Lift"]', 0, '00000000-0000-4000-8000-0000000000a1',
   @now - INTERVAL 60 DAY, @now - INTERVAL 58 DAY, @now + INTERVAL 32 DAY, @now - INTERVAL 10 DAY, NULL, NULL, @now - INTERVAL 60 DAY),
  -- Expired
  ('00000000-0000-4000-a000-000000000032', 'BRX-2026-0032', 'expired', 'rent', 'shop',
   'Small shop near Hampankatta market',
   '250 sq.ft ground-floor shop with shutter and power connection, high footfall.',
   18000, 1, 'Hampankatta', 'Mangalore', 'Shop 12, Market Road', NULL, NULL, NULL, 250, 'unfurnished', 'Ground', NULL, NULL,
   '["Power backup"]', 0, '00000000-0000-4000-8000-0000000000a3',
   @now - INTERVAL 100 DAY, @now - INTERVAL 98 DAY, @now - INTERVAL 8 DAY, NULL, NULL, NULL, @now - INTERVAL 100 DAY),
  -- Archived
  ('00000000-0000-4000-a000-000000000033', 'BRX-2026-0033', 'archived', 'rent', 'apartment',
   '1 BHK studio near St Aloysius College',
   'Compact furnished studio, ideal for a working professional.',
   9000, 0, 'Hampankatta', 'Mangalore', 'Aloysius Road', NULL, 1, 1, 480, 'fully_furnished', '1 of 3', NULL, NULL,
   '["Water supply 24x7"]', 0, '00000000-0000-4000-8000-0000000000a1',
   @now - INTERVAL 80 DAY, @now - INTERVAL 78 DAY, @now + INTERVAL 12 DAY, NULL, NULL, NULL, @now - INTERVAL 80 DAY),
  -- Live, expiring in 4 days (shows on the dashboard)
  ('00000000-0000-4000-a000-000000000034', 'BRX-2026-0034', 'approved', 'rent', 'apartment',
   '2 BHK semi-furnished flat in Bendoorwell',
   'Spacious 2 BHK with balcony, close to St Agnes College and City Hospital. Family preferred.',
   19000, 1, 'Bendoorwell', 'Mangalore', 'Flat 3B, Agnes Enclave', NULL, 2, 2, 1100, 'semi_furnished', '3 of 6', '5 years', NULL,
   '["Car parking","Lift","Power backup"]', 0, '00000000-0000-4000-8000-0000000000a3',
   @now - INTERVAL 88 DAY, @now - INTERVAL 86 DAY, @now + INTERVAL 4 DAY, NULL, NULL, NULL, @now - INTERVAL 88 DAY);

-- Photos (re-using the bundled sample images; demo/ originals are hidden in admin)
INSERT IGNORE INTO property_images (id, property_id, storage_path, watermarked_path, sort_order, is_cover, is_visible, approved, created_at) VALUES
  ('00000000-0000-4000-b000-000000002501', '00000000-0000-4000-a000-000000000025', 'demo/samples/lalbagh-1.webp', '/samples/lalbagh-1.webp', 0, 1, 1, 0, @now - INTERVAL 3 DAY),
  ('00000000-0000-4000-b000-000000002502', '00000000-0000-4000-a000-000000000025', 'demo/samples/lalbagh-2.webp', '/samples/lalbagh-2.webp', 1, 0, 1, 0, @now - INTERVAL 3 DAY),
  ('00000000-0000-4000-b000-000000002503', '00000000-0000-4000-a000-000000000025', 'demo/samples/lalbagh-3.webp', '/samples/lalbagh-3.webp', 2, 0, 1, 0, @now - INTERVAL 3 DAY),
  ('00000000-0000-4000-b000-000000002601', '00000000-0000-4000-a000-000000000026', 'demo/samples/urwa-1.webp', '/samples/urwa-1.webp', 0, 1, 1, 0, @now - INTERVAL 30 HOUR),
  ('00000000-0000-4000-b000-000000002602', '00000000-0000-4000-a000-000000000026', 'demo/samples/urwa-2.webp', '/samples/urwa-2.webp', 1, 0, 1, 0, @now - INTERVAL 30 HOUR),
  ('00000000-0000-4000-b000-000000002603', '00000000-0000-4000-a000-000000000026', 'demo/samples/urwa-3.webp', '/samples/urwa-3.webp', 2, 0, 1, 0, @now - INTERVAL 30 HOUR),
  ('00000000-0000-4000-b000-000000002701', '00000000-0000-4000-a000-000000000027', 'demo/samples/surathkal-1.webp', '/samples/surathkal-1.webp', 0, 1, 1, 0, @now - INTERVAL 5 HOUR),
  ('00000000-0000-4000-b000-000000002702', '00000000-0000-4000-a000-000000000027', 'demo/samples/surathkal-2.webp', '/samples/surathkal-2.webp', 1, 0, 1, 0, @now - INTERVAL 5 HOUR),
  ('00000000-0000-4000-b000-000000002703', '00000000-0000-4000-a000-000000000027', 'demo/samples/surathkal-3.webp', '/samples/surathkal-3.webp', 2, 0, 1, 0, @now - INTERVAL 5 HOUR),
  ('00000000-0000-4000-b000-000000002801', '00000000-0000-4000-a000-000000000028', 'demo/samples/hampankatta-1.webp', '/samples/hampankatta-1.webp', 0, 1, 1, 0, @now - INTERVAL 4 DAY),
  ('00000000-0000-4000-b000-000000002802', '00000000-0000-4000-a000-000000000028', 'demo/samples/hampankatta-2.webp', '/samples/hampankatta-2.webp', 1, 0, 1, 0, @now - INTERVAL 4 DAY),
  ('00000000-0000-4000-b000-000000002803', '00000000-0000-4000-a000-000000000028', 'demo/samples/hampankatta-3.webp', '/samples/hampankatta-3.webp', 2, 0, 1, 0, @now - INTERVAL 4 DAY),
  ('00000000-0000-4000-b000-000000002901', '00000000-0000-4000-a000-000000000029', 'demo/samples/kankanady-1.webp', '/samples/kankanady-1.webp', 0, 1, 1, 0, @now - INTERVAL 8 DAY),
  ('00000000-0000-4000-b000-000000003001', '00000000-0000-4000-a000-000000000030', 'demo/samples/derebail-1.webp', '/samples/derebail-1.webp', 0, 1, 1, 1, @now - INTERVAL 35 DAY),
  ('00000000-0000-4000-b000-000000003002', '00000000-0000-4000-a000-000000000030', 'demo/samples/derebail-2.webp', '/samples/derebail-2.webp', 1, 0, 1, 1, @now - INTERVAL 35 DAY),
  ('00000000-0000-4000-b000-000000003101', '00000000-0000-4000-a000-000000000031', 'demo/samples/kankanady-2.webp', '/samples/kankanady-2.webp', 0, 1, 1, 1, @now - INTERVAL 60 DAY),
  ('00000000-0000-4000-b000-000000003201', '00000000-0000-4000-a000-000000000032', 'demo/samples/falnir-1.webp', '/samples/falnir-1.webp', 0, 1, 1, 1, @now - INTERVAL 100 DAY),
  ('00000000-0000-4000-b000-000000003301', '00000000-0000-4000-a000-000000000033', 'demo/samples/bejai-2.webp', '/samples/bejai-2.webp', 0, 1, 1, 1, @now - INTERVAL 80 DAY),
  ('00000000-0000-4000-b000-000000003401', '00000000-0000-4000-a000-000000000034', 'demo/samples/pumpwell-1.webp', '/samples/pumpwell-1.webp', 0, 1, 1, 1, @now - INTERVAL 88 DAY),
  ('00000000-0000-4000-b000-000000003402', '00000000-0000-4000-a000-000000000034', 'demo/samples/pumpwell-2.webp', '/samples/pumpwell-2.webp', 1, 0, 1, 1, @now - INTERVAL 88 DAY),
  ('00000000-0000-4000-b000-000000003403', '00000000-0000-4000-a000-000000000034', 'demo/samples/pumpwell-3.webp', '/samples/pumpwell-3.webp', 2, 0, 1, 1, @now - INTERVAL 88 DAY);

UPDATE app_config SET value = GREATEST(CAST(value AS UNSIGNED), 34) WHERE name = 'ref_seq';

-- ---------------------------------------------------------------------------
-- Change requests (on seeded live listings and the sold_pending villa)
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO change_requests (id, property_id, type, proposed, status, requested_at, submitted, reviewed_at, admin_note) VALUES
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-8000-000000000002', 'price',
   '{"price":20000,"price_negotiable":true,"note":"Reducing rent to find a tenant faster."}', 'pending', @now - INTERVAL 20 HOUR, 1, NULL, NULL),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-8000-000000000004', 'details',
   '{"description":"Compact, well-planned 2 BHK ideal for first-time buyers. Freshly painted, new modular kitchen fitted this year. Excellent connectivity to NH 66, Pumpwell flyover and Kankanady railway station. Ready to move in.","available_from":null,"hide_image_ids":[],"note":"Kitchen renovated, please update."}',
   'pending', @now - INTERVAL 2 DAY, 1, NULL, NULL),
  ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-a000-000000000030', 'sold', '{}', 'pending', @now - INTERVAL 1 DAY, 1, NULL, NULL),
  ('00000000-0000-4000-c000-000000000004', '00000000-0000-4000-8000-000000000007', 'price',
   '{"price":9500000,"price_negotiable":true}', 'approved', @now - INTERVAL 9 DAY, 1, @now - INTERVAL 8 DAY, NULL),
  ('00000000-0000-4000-c000-000000000005', '00000000-0000-4000-8000-000000000009', 'price',
   '{"price":9000000,"price_negotiable":false}', 'rejected', @now - INTERVAL 6 DAY, 1, @now - INTERVAL 5 DAY,
   'The new price looks like a typo (₹90 L vs ₹1.6 Cr). Please confirm the amount and submit again.');

-- ---------------------------------------------------------------------------
-- Enquiries (some today, one not forwarded)
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO enquiries (id, property_id, name, phone, message, created_at, forwarded, forward_error) VALUES
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-8000-000000000001', 'Prakash Rao',     '919845011111', 'Is the price negotiable? Looking to buy within 2 months.', @now - INTERVAL 40 MINUTE, 1, NULL),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-8000-000000000002', 'Divya Nayak',     '919845022222', 'We are a family of three. Is it available from 15th?', @now - INTERVAL 3 HOUR, 1, NULL),
  ('00000000-0000-4000-e000-000000000003', '00000000-0000-4000-8000-000000000006', 'Arjun Bhat',      '919845033333', 'Need office for 25 people, can we visit tomorrow?', @now - INTERVAL 5 HOUR, 0, '(#131030) Recipient phone number not in allowed list'),
  ('00000000-0000-4000-e000-000000000004', '00000000-0000-4000-8000-000000000003', 'Meera D''Souza',  '919845044444', NULL, @now - INTERVAL 1 DAY, 1, NULL),
  ('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-8000-000000000009', 'Imran Sheikh',    '919845055555', 'NRI buyer, can you share a video walkthrough?', @now - INTERVAL 2 DAY, 1, NULL),
  ('00000000-0000-4000-e000-000000000006', '00000000-0000-4000-8000-000000000010', 'Kavya Hegde',     '919845066666', 'Is it okay for two working women?', @now - INTERVAL 3 DAY, 1, NULL),
  ('00000000-0000-4000-e000-000000000007', '00000000-0000-4000-8000-000000000005', 'Suresh Poojary',  '919845077777', 'Please share survey number and RTC.', @now - INTERVAL 4 DAY, 1, NULL),
  ('00000000-0000-4000-e000-000000000008', '00000000-0000-4000-8000-000000000001', 'Nisha Kotian',    '919845088888', 'Do you have similar flats in Kadri under 70 L?', @now - INTERVAL 6 DAY, 1, NULL);

-- ---------------------------------------------------------------------------
-- WhatsApp message log
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO messages (id, recipient_phone, template_name, payload, wa_message_id, status, error, attempts, enquiry_id, created_at) VALUES
  ('00000000-0000-4000-f000-000000000001', '919800000000', 'enquiry_forward', '{"params":["BRX-2026-0001","Prakash Rao","+91 98450 11111","Is the price negotiable? Looking to buy within 2 months.","http://localhost:3001/properties/BRX-2026-0001"]}', 'wamid.demo1', 'read', NULL, 1, '00000000-0000-4000-e000-000000000001', @now - INTERVAL 40 MINUTE),
  ('00000000-0000-4000-f000-000000000002', '919800000000', 'enquiry_forward', '{"params":["BRX-2026-0002","Divya Nayak","+91 98450 22222","We are a family of three. Is it available from 15th?","http://localhost:3001/properties/BRX-2026-0002"]}', 'wamid.demo2', 'delivered', NULL, 1, '00000000-0000-4000-e000-000000000002', @now - INTERVAL 3 HOUR),
  ('00000000-0000-4000-f000-000000000003', '919800000000', 'enquiry_forward', '{"params":["BRX-2026-0006","Arjun Bhat","+91 98450 33333","Need office for 25 people, can we visit tomorrow?","http://localhost:3001/properties/BRX-2026-0006"]}', NULL, 'failed', '(#131030) Recipient phone number not in allowed list', 2, '00000000-0000-4000-e000-000000000003', @now - INTERVAL 5 HOUR),
  ('00000000-0000-4000-f000-000000000004', '919999900003', 'submission_received', '{"params":["Fathima Rizwan","BRX-2026-0027"]}', 'wamid.demo4', 'delivered', NULL, 1, NULL, @now - INTERVAL 5 HOUR),
  ('00000000-0000-4000-f000-000000000005', '919999900003', 'otp_login', '{"params":["******"]}', 'wamid.demo5', 'read', NULL, 1, NULL, @now - INTERVAL 6 HOUR),
  ('00000000-0000-4000-f000-000000000006', '919999900002', 'submission_received', '{"params":["Rahul Kamath","BRX-2026-0026"]}', 'wamid.demo6', 'read', NULL, 1, NULL, @now - INTERVAL 30 HOUR),
  ('00000000-0000-4000-f000-000000000007', '919999900002', 'listing_rejected', '{"params":["BRX-2026-0029","Please add a clear title, a proper description and photos of the rooms."]}', 'wamid.demo7', 'read', NULL, 1, NULL, @now - INTERVAL 7 DAY),
  ('00000000-0000-4000-f000-000000000008', '919999900004', 'change_received', '{"params":["BRX-2026-0030","Mark as sold"]}', NULL, 'failed', 'Message undeliverable', 1, NULL, @now - INTERVAL 1 DAY),
  ('00000000-0000-4000-f000-000000000009', '919999900001', 'sold_confirmed', '{"params":["BRX-2026-0031"]}', 'wamid.demo9', 'delivered', NULL, 1, NULL, @now - INTERVAL 10 DAY);

-- ---------------------------------------------------------------------------
-- Activity log
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO activity_log (id, entity_type, entity_id, action, actor_type, actor_id, diff, created_at) VALUES
  ('00000000-0000-4000-d000-000000000001', 'property', '00000000-0000-4000-a000-000000000025', 'submitted', 'owner', '00000000-0000-4000-8000-0000000000a1', NULL, @now - INTERVAL 3 DAY),
  ('00000000-0000-4000-d000-000000000002', 'property', '00000000-0000-4000-a000-000000000026', 'submitted', 'owner', '00000000-0000-4000-8000-0000000000a2', NULL, @now - INTERVAL 30 HOUR),
  ('00000000-0000-4000-d000-000000000003', 'property', '00000000-0000-4000-a000-000000000027', 'submitted', 'owner', '00000000-0000-4000-8000-0000000000a3', NULL, @now - INTERVAL 5 HOUR),
  ('00000000-0000-4000-d000-000000000004', 'property', '00000000-0000-4000-a000-000000000028', 'submitted', 'owner', '00000000-0000-4000-8000-0000000000a4', NULL, @now - INTERVAL 4 DAY),
  ('00000000-0000-4000-d000-000000000005', 'property', '00000000-0000-4000-a000-000000000029', 'submitted', 'owner', '00000000-0000-4000-8000-0000000000a2', NULL, @now - INTERVAL 8 DAY),
  ('00000000-0000-4000-d000-000000000006', 'property', '00000000-0000-4000-a000-000000000029', 'rejected', 'system', NULL, '{"reason":"Please add a clear title, a proper description and photos of the rooms."}', @now - INTERVAL 7 DAY),
  ('00000000-0000-4000-d000-000000000007', 'property', '00000000-0000-4000-a000-000000000030', 'change_requested:sold', 'owner', '00000000-0000-4000-8000-0000000000a4', '{"status":{"from":"approved","to":"sold_pending"}}', @now - INTERVAL 1 DAY),
  ('00000000-0000-4000-d000-000000000008', 'property', '00000000-0000-4000-8000-000000000002', 'change_requested:price', 'owner', '00000000-0000-4000-8000-0000000000aa', '{"price":20000}', @now - INTERVAL 20 HOUR),
  ('00000000-0000-4000-d000-000000000009', 'property', '00000000-0000-4000-a000-000000000032', 'expired', 'system', NULL, NULL, @now - INTERVAL 8 DAY);
