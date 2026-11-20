// The admin navigation in one place: a short sidebar of groups, and each group's pages
// as tabs at the top of the content area (SectionTabs). Used by AdminNav and SectionTabs.

export type Counts = { submissions: number; requests: number; failed: number; followUps: number; unread: number; visits: number; enquiries: number };
export type Tone = "warn" | "bad";
export type NavTab = { href: string; label: string; count?: number; tone?: Tone };
export type NavGroup = {
  label: string;
  icon: string;
  /** Where the sidebar item goes (the first tab). */
  href: string;
  tabs: NavTab[];
  /** Other paths in this group without a tab of their own (detail pages). */
  match?: string[];
  count?: number;
  tone?: Tone;
};

/** Sum of the tabs' counts; red if any red tab has items. */
function badge(tabs: NavTab[]) {
  const count = tabs.reduce((n, t) => n + (t.count ?? 0), 0);
  const tone: Tone = tabs.some((t) => t.tone === "bad" && t.count) ? "bad" : "warn";
  return { count, tone };
}

function group(g: Omit<NavGroup, "href" | "count" | "tone">): NavGroup {
  return { ...g, href: g.tabs[0]?.href ?? "/admin", ...badge(g.tabs) };
}

export function navGroups(role: "admin" | "agent", c: Counts): NavGroup[] {
  const dashboard: NavGroup = { label: "Dashboard", icon: "dashboard", href: "/admin", tabs: [] };
  const settings: NavGroup = { label: "Settings", icon: "settings", href: "/admin/settings", tabs: [], match: ["/admin/profile"] };
  const visits: NavTab = { href: "/admin/verifications", label: "Site visits", count: c.visits, tone: "warn" };
  const clientTabs: NavTab[] = [
    { href: "/admin/clients", label: "Clients", count: c.followUps, tone: "warn" },
    ...(role === "admin" ? [{ href: "/admin/enquiries", label: "Enquiries", count: c.enquiries, tone: "bad" as const }] : []),
    { href: "/admin/inbox", label: "Inbox", count: c.unread, tone: "bad" },
    { href: "/admin/calendar", label: "Calendar" },
  ];

  if (role !== "admin") {
    return [dashboard, group({ label: "Site visits", icon: "verify", tabs: [visits] }), group({ label: "Clients", icon: "clients", tabs: clientTabs }), settings];
  }
  return [
    dashboard,
    group({
      label: "Listings",
      icon: "listings",
      tabs: [
        { href: "/admin/submissions", label: "Submissions", count: c.submissions, tone: "warn" },
        { href: "/admin/listings", label: "Listings" },
        visits,
        { href: "/admin/requests", label: "Change requests", count: c.requests, tone: "warn" },
        { href: "/admin/builders", label: "Builders" },
      ],
      match: ["/admin/properties"],
    }),
    group({ label: "Clients", icon: "clients", tabs: clientTabs }),
    group({
      label: "Team",
      icon: "users",
      tabs: [
        { href: "/admin/users", label: "Users" },
        { href: "/admin/workload", label: "Workload" },
        { href: "/admin/activity", label: "Activity" },
        { href: "/admin/reports", label: "Reports" },
      ],
      match: ["/admin/members", "/admin/agents"],
    }),
    group({
      label: "WhatsApp",
      icon: "messages",
      tabs: [
        { href: "/admin/broadcasts", label: "Broadcasts" },
        { href: "/admin/templates", label: "Templates" },
        { href: "/admin/messages", label: "Message log", count: c.failed, tone: "bad" },
        { href: "/admin/broadcasts/opt-outs", label: "Opt-outs" },
      ],
    }),
    settings,
  ];
}

const within = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** The group and tab for a path. The longest matching tab wins (/admin/broadcasts/opt-outs isn't "Broadcasts"). */
export function locate(groups: NavGroup[], path: string): { group: NavGroup | null; tab: NavTab | null } {
  let best: { group: NavGroup; tab: NavTab } | null = null;
  for (const g of groups) for (const t of g.tabs) if (within(path, t.href) && (!best || t.href.length > best.tab.href.length)) best = { group: g, tab: t };
  if (best) return best;
  const g = groups.find((x) => x.href !== "/admin" && (within(path, x.href) || x.match?.some((m) => within(path, m))));
  return { group: g ?? (path === "/admin" ? groups[0] : null), tab: null };
}
