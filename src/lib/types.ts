// Hand-written row types matching db/schema.sql. Rows are normalised by src/lib/db.ts:
// timestamps are ISO strings, TINYINT(1) is boolean, JSON columns are parsed.

export type UserRole = "admin" | "agent" | "owner";
export type PropertyStatus =
  | "draft"
  | "pending"
  | "under_review"
  | "approved"
  | "rejected"
  | "sold_pending"
  | "sold"
  | "archived"
  | "expired";
export type ListingType = "sale" | "rent";
export type PropertyType =
  | "apartment"
  | "villa"
  | "independent_house"
  | "plot"
  | "commercial"
  | "office"
  | "shop"
  | "warehouse";
export type Furnishing = "unfurnished" | "semi_furnished" | "fully_furnished";
export type ChangeType = "price" | "details" | "sold";
export type RequestStatus = "pending" | "approved" | "rejected";
export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed";
export type ProjectStatus = "upcoming" | "under_construction" | "ready";

export type Profile = {
  id: string;
  role: UserRole;
  name: string | null;
  phone: string | null;
  wa_opt_out: boolean;
  created_at: string;
};

export type Property = {
  id: string;
  reference_no: string;
  status: PropertyStatus;
  listing_type: ListingType;
  property_type: PropertyType;
  title: string;
  description: string | null;
  price: number;
  price_negotiable: boolean;
  locality: string;
  city: string;
  private_address: string | null;
  private_landmark: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area_sqft: number | null;
  furnishing: Furnishing | null;
  floor: string | null;
  property_age: string | null;
  available_from: string | null;
  amenities: string[];
  builder_id: string | null;
  project_id: string | null;
  rera_no: string | null;
  featured: boolean;
  owner_id: string;
  submitted_at: string | null;
  reviewed_by: string | null;
  approved_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  rejected_reason: string | null;
  sold_at: string | null;
  expires_at: string | null;
  original_submission: Record<string, unknown> | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicProperty = Pick<
  Property,
  | "id"
  | "reference_no"
  | "listing_type"
  | "property_type"
  | "title"
  | "description"
  | "price"
  | "price_negotiable"
  | "locality"
  | "city"
  | "bedrooms"
  | "bathrooms"
  | "area_sqft"
  | "furnishing"
  | "floor"
  | "property_age"
  | "available_from"
  | "amenities"
  | "rera_no"
  | "featured"
  | "approved_at"
  | "verified_at"
  | "updated_at"
> & {
  builder_name: string | null;
  builder_rera_no: string | null;
  project_name: string | null;
  project_rera_no: string | null;
  cover_path: string | null;
};

export type MyProperty = Pick<
  Property,
  | "id"
  | "reference_no"
  | "status"
  | "listing_type"
  | "property_type"
  | "title"
  | "description"
  | "price"
  | "price_negotiable"
  | "locality"
  | "city"
  | "private_address"
  | "bedrooms"
  | "bathrooms"
  | "area_sqft"
  | "furnishing"
  | "available_from"
  | "rejected_reason"
  | "submitted_at"
  | "approved_at"
  | "sold_at"
  | "expires_at"
  | "created_at"
> & { cover_path: string | null };

export type PropertyImage = {
  id: string;
  property_id: string;
  storage_path: string;
  watermarked_path: string;
  sort_order: number;
  is_cover: boolean;
  is_visible: boolean;
  approved: boolean;
  change_request_id: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type Builder = {
  id: string;
  name: string;
  rera_no: string | null;
  contact_name: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
};

export type Project = {
  id: string;
  builder_id: string;
  name: string;
  locality: string | null;
  rera_no: string | null;
  status: ProjectStatus;
  created_at: string;
};

export type ChangeRequest = {
  id: string;
  property_id: string;
  type: ChangeType;
  proposed: ProposedChange;
  status: RequestStatus;
  requested_at: string;
  submitted: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
};

export type ProposedChange = {
  price?: number;
  price_negotiable?: boolean;
  description?: string;
  available_from?: string | null;
  hide_image_ids?: string[];
  note?: string;
};

export type Enquiry = {
  id: string;
  property_id: string | null;
  name: string;
  phone: string;
  message: string | null;
  created_at: string;
  forwarded: boolean;
  forward_error: string | null;
  client_id: string | null;
  user_id: string | null;
};

export type EnquiryMessage = {
  id: string;
  enquiry_id: string;
  sender: "staff" | "member";
  author_id: string | null;
  body: string;
  read_at: string | null;
  created_at: string;
};

export type Message = {
  id: string;
  recipient_phone: string;
  template_name: string;
  payload: { params?: string[] };
  wa_message_id: string | null;
  status: MessageStatus;
  error: string | null;
  attempts: number;
  enquiry_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ActivityLog = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_type: "admin" | "owner" | "system";
  actor_id: string | null;
  diff: Record<string, unknown> | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------

export type AgentType = "agent" | "broker";

export type Agent = {
  id: string;
  role: "admin" | "agent";
  is_active: boolean;
  agent_type: AgentType | null;
  name: string | null;
  email: string | null;
  work_phone: string | null;
  company: string | null;
  rera_no: string | null;
  commission_pct: number | null;
  notes: string | null;
  has_password: boolean;
  created_at: string;
};

export type ClientType = "buyer" | "tenant" | "seller" | "landlord" | "investor";
export type ClientStatus = "new" | "contacted" | "site_visit" | "negotiation" | "won" | "lost";
export type ClientSource = "website" | "walk_in" | "referral" | "phone" | "whatsapp" | "broker" | "social" | "other";

export type Client = {
  id: string;
  name: string;
  phone: string;
  alt_phone: string | null;
  email: string | null;
  type: ClientType;
  status: ClientStatus;
  source: ClientSource;
  listing_type: ListingType | null;
  property_types: PropertyType[];
  localities: string | null;
  bedrooms: number | null;
  budget_min: number | null;
  budget_max: number | null;
  notes: string | null;
  lost_reason: string | null;
  property_id: string | null;
  assigned_to: string | null;
  broker_id: string | null;
  next_follow_up: string | null;
  last_contact_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientActivityType = "note" | "call" | "whatsapp" | "email" | "meeting" | "site_visit" | "status" | "assigned" | "enquiry";

export type ClientActivity = {
  id: string;
  client_id: string;
  type: ClientActivityType;
  body: string | null;
  property_id: string | null;
  actor_id: string | null;
  created_at: string;
};

export type SiteVerification = {
  id: string;
  property_id: string;
  status: "scheduled" | "completed" | "cancelled";
  result: "verified" | "issues" | null;
  scheduled_at: string | null;
  assigned_to: string | null;
  visited_at: string | null;
  checklist: Record<string, boolean> | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  location_accuracy_m: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ActionState = { ok: boolean; error?: string; message?: string } | null;
