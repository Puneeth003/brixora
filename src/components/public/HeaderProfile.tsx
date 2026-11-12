import { cache } from "react";
import { getOwner } from "@/lib/auth";
import { displayPhone } from "@/lib/format";
import { unreadReplies } from "@/lib/member";
import { MobileMenu } from "./NavLinks";
import { ProfileMenu, type HeaderUser } from "./ProfileMenu";

/**
 * Signed-in member for the header, read once per request and shared by the desktop
 * profile menu and the mobile menu. A database problem shows the signed-out header
 * instead of breaking every public page.
 */
const headerUser = cache(async (): Promise<HeaderUser | null> => {
  try {
    const owner = await getOwner();
    if (!owner) return null;
    const unread = await unreadReplies(owner.id);
    return { name: owner.profile.name, phone: displayPhone(owner.phone), unread };
  } catch (e) {
    console.error("[header] could not read the member session", e);
    return null;
  }
});

// Both read the session cookie: render each inside Suspense so the rest of the page stays static.

export async function HeaderProfile() {
  return <ProfileMenu user={await headerUser()} />;
}

export async function HeaderMobileMenu({ contactHref }: { contactHref: string }) {
  return <MobileMenu contactHref={contactHref} user={await headerUser()} />;
}
