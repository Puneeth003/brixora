// CRM labels and colours, shared by server and client components.
import type { AgentType, ClientActivityType, ClientSource, ClientStatus, ClientType } from "./types";

export const CLIENT_STATUSES: { value: ClientStatus; label: string; color: string }[] = [
  { value: "new", label: "New", color: "bg-sky-100 text-sky-800" },
  { value: "contacted", label: "Contacted", color: "bg-indigo-100 text-indigo-800" },
  { value: "site_visit", label: "Site visit", color: "bg-violet-100 text-violet-800" },
  { value: "negotiation", label: "Negotiation", color: "bg-amber-100 text-amber-800" },
  { value: "won", label: "Won", color: "bg-emerald-100 text-emerald-800" },
  { value: "lost", label: "Lost", color: "bg-zinc-200 text-zinc-700" },
];

export const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: "buyer", label: "Buyer" },
  { value: "tenant", label: "Tenant" },
  { value: "seller", label: "Seller" },
  { value: "landlord", label: "Landlord" },
  { value: "investor", label: "Investor" },
];

export const CLIENT_SOURCES: { value: ClientSource; label: string }[] = [
  { value: "website", label: "Website enquiry" },
  { value: "walk_in", label: "Walk-in" },
  { value: "phone", label: "Phone call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "referral", label: "Referral" },
  { value: "broker", label: "Broker" },
  { value: "social", label: "Social media" },
  { value: "other", label: "Other" },
];

export const ACTIVITY_TYPES: { value: ClientActivityType; label: string; loggable: boolean }[] = [
  { value: "note", label: "Note", loggable: true },
  { value: "call", label: "Call", loggable: true },
  { value: "whatsapp", label: "WhatsApp", loggable: true },
  { value: "email", label: "Email", loggable: true },
  { value: "meeting", label: "Meeting", loggable: true },
  { value: "site_visit", label: "Site visit", loggable: true },
  { value: "status", label: "Status change", loggable: false },
  { value: "assigned", label: "Assignment", loggable: false },
  { value: "enquiry", label: "Website enquiry", loggable: false },
];

export const AGENT_TYPES: { value: AgentType; label: string }[] = [
  { value: "agent", label: "In-house agent" },
  { value: "broker", label: "Partner broker" },
];

export const label = <T extends string>(list: { value: T; label: string }[], v: T | null | undefined) =>
  list.find((x) => x.value === v)?.label ?? (v ? String(v) : "—");
