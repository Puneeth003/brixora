// Stroke icons for the admin sidebar (24×24, currentColor).
const P = ({ d }: { d: string }) => <path d={d} />;

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export const NAV_ICONS: Record<string, React.ReactNode> = {
  dashboard: (
    <Svg>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Svg>
  ),
  submissions: (
    <Svg>
      <P d="M12 3v12" />
      <P d="m7 10 5 5 5-5" />
      <P d="M5 21h14" />
    </Svg>
  ),
  listings: (
    <Svg>
      <P d="M3 10.5 12 3l9 7.5" />
      <P d="M5 9.5V21h14V9.5" />
      <P d="M10 21v-6h4v6" />
    </Svg>
  ),
  requests: (
    <Svg>
      <P d="M4 7h11" />
      <P d="m12 3 4 4-4 4" />
      <P d="M20 17H9" />
      <P d="m12 13-4 4 4 4" />
    </Svg>
  ),
  builders: (
    <Svg>
      <P d="M4 21V8l6-4v17" />
      <P d="M10 21V10l10 4v7" />
      <P d="M3 21h18" />
    </Svg>
  ),
  clients: (
    <Svg>
      <circle cx="9" cy="8" r="3.5" />
      <P d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <P d="M16 4.5a3.5 3.5 0 0 1 0 7" />
      <P d="M18 14a5.5 5.5 0 0 1 3.5 6" />
    </Svg>
  ),
  inbox: (
    <Svg>
      <P d="M3 13h5l1.5 3h5L16 13h5" />
      <P d="M5.5 5h13L21 13v6H3v-6z" />
    </Svg>
  ),
  users: (
    <Svg>
      <circle cx="12" cy="8" r="4" />
      <P d="M4 21a8 8 0 0 1 16 0" />
    </Svg>
  ),
  agents: (
    <Svg>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <P d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <P d="M3 13h18" />
    </Svg>
  ),
  enquiries: (
    <Svg>
      <P d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.6A8.5 8.5 0 1 1 21 12z" />
    </Svg>
  ),
  verify: (
    <Svg>
      <P d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />
      <P d="m9 12 2 2 4-4" />
    </Svg>
  ),
  calendar: (
    <Svg>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <P d="M16 3v4M8 3v4M3 10h18" />
    </Svg>
  ),
  workload: (
    <Svg>
      <P d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </Svg>
  ),
  activity: (
    <Svg>
      <P d="M3 12h4l3-8 4 16 3-8h4" />
    </Svg>
  ),
  reports: (
    <Svg>
      <path d="M21 12A9 9 0 1 1 12 3v9z" />
      <P d="M15 3.5A9 9 0 0 1 20.5 9H15z" />
    </Svg>
  ),
  settings: (
    <Svg>
      <circle cx="12" cy="12" r="3" />
      <P d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Svg>
  ),
  messages: (
    <Svg>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <P d="m3 7 9 6 9-6" />
    </Svg>
  ),
};
