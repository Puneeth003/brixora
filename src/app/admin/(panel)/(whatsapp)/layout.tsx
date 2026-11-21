import { WhatsAppTabs } from "./WhatsAppTabs";

// One "WhatsApp" item in the sidebar; its screens are tabs here instead.
export default function WhatsAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WhatsAppTabs />
      {children}
    </>
  );
}
