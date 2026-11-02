import type { Metadata } from "next";
import { AuthScene } from "@/components/AuthScene";

export const metadata: Metadata = { title: "Staff login", robots: { index: false, follow: false } };

/** Staff sign-in, password reset and 2FA, on the same full-screen scene as the member login. */
export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1">
      <AuthScene
        title={
          <>
            Every great deal
            <br />
            starts here
          </>
        }
        subtitle="Log in to manage listings, clients and site visits."
      >
        {/* The forms below were built as cards; inside the scene's card they sit flat. */}
        <div className="[&_.card]:bg-transparent [&_.card]:p-0 [&_.card]:shadow-none">{children}</div>
      </AuthScene>
    </main>
  );
}
