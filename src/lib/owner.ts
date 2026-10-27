import "server-only";

// Owner-safe columns only (no internal notes, reviewer, original submission).
export const MY_PROPERTY_SELECT = `p.id, p.reference_no, p.status, p.listing_type, p.property_type, p.title, p.description,
  p.price, p.price_negotiable, p.locality, p.city, p.private_address, p.bedrooms, p.bathrooms, p.area_sqft, p.furnishing,
  p.available_from, p.rejected_reason, p.submitted_at, p.approved_at, p.sold_at, p.expires_at, p.created_at,
  (SELECT i.watermarked_path FROM property_images i WHERE i.property_id = p.id AND i.is_visible = 1
    ORDER BY i.is_cover DESC, i.sort_order, i.created_at LIMIT 1) AS cover_path`;
