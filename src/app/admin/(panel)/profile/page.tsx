import { redirect } from "next/navigation";

export default function ProfilePage() {
  redirect("/admin/settings?section=profile");
}
