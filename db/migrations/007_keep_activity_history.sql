-- Keep a client's timeline entries when the client is deleted, so the staff contact and
-- win counts on Admin → Activity and Reports don't drop. Until now the entries were
-- deleted with the client (ON DELETE CASCADE).
--
-- After this migration a deleted client's entries stay with client_id = NULL. The app
-- clears their text before deleting the client (deleteClient in src/app/admin/crm-actions.ts),
-- so no notes about the person are kept: only who did what kind of thing, and when.
--
-- Optional and safe to apply at any time: the app works the same before it, except that
-- deleting a client still removes their entries from the counts.

ALTER TABLE client_activities DROP FOREIGN KEY client_activities_client_fk;

ALTER TABLE client_activities MODIFY client_id CHAR(36) CHARACTER SET ascii NULL;

ALTER TABLE client_activities
  ADD CONSTRAINT client_activities_client_fk FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL;
