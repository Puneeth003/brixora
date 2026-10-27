// Minimal stroke icons (24×24, currentColor).
type P = React.SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
      className={`size-4 shrink-0 ${props.className ?? ""}`}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M10 21v-6h4v6" />
  </Icon>
);
export const KeyIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="m10.8 12.2 8.2-8.2M17 6l2 2M15 8l2 2" />
  </Icon>
);
export const BuildingIcon = (p: P) => (
  <Icon {...p}>
    <rect x="4" y="3" width="11" height="18" rx="1" />
    <path d="M15 9h4a1 1 0 0 1 1 1v11h-5M8 7h3M8 11h3M8 15h3" />
  </Icon>
);
export const BriefcaseIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" />
  </Icon>
);
export const StoreIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 10v10h16V10M3 4h18l-1.5 6a2.5 2.5 0 0 1-4.5 0 2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 1-4.5 0Z" />
    <path d="M10 20v-5h4v5" />
  </Icon>
);
export const MapPinIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Icon>
);
export const BedIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 18V6M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5" />
    <circle cx="7" cy="11" r="2" />
  </Icon>
);
export const BathIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3ZM6 12V5a2 2 0 0 1 3.5-1.3M7 19l-1 2M17 19l1 2" />
  </Icon>
);
export const AreaIcon = (p: P) => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="16" rx="1" />
    <path d="M4 9h3M4 14h3M9 20v-3M14 20v-3" />
  </Icon>
);
export const SearchIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </Icon>
);
export const ArrowRightIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);
export const PhoneIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
  </Icon>
);
export const ShieldIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);
export const UserIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Icon>
);
export const LockIcon = (p: P) => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Icon>
);
export const SparkleIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
  </Icon>
);
export const SunIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" fill="currentColor" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);
export const TagIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z" />
    <circle cx="7.5" cy="7.5" r="1.5" />
  </Icon>
);
