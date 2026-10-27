import { Nunito_Sans } from "next/font/google";

const nunito = Nunito_Sans({ variable: "--font-admin", subsets: ["latin"], weight: ["400", "600", "700", "800"] });

/** Admin theme root: font and the scoped .admin-ui styles (see globals.css). */
export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return <div className={`${nunito.variable} admin-ui flex min-h-full flex-1 flex-col`}>{children}</div>;
}
