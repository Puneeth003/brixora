import "server-only";
import { db } from "./db";

/** Unread replies from our team on this member's enquiries. */
export function unreadReplies(userId: string) {
  return db.count(
    `SELECT COUNT(*) FROM enquiry_messages m JOIN enquiries e ON e.id = m.enquiry_id
      WHERE e.user_id = ? AND m.sender = 'staff' AND m.read_at IS NULL`,
    [userId],
  );
}
