import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of use",
  description: `The terms for using ${site.name} to list, find and enquire about properties.`,
};

const LAST_UPDATED = "6 November 2026";

export default function TermsPage() {
  const { email, phone, address } = site.brokerage;
  const contact = email || phone || "our office";
  return (
    <article className="container-page max-w-3xl space-y-6 py-12 text-zinc-700 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-900">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Terms of use</h1>
      <p className="text-sm text-zinc-500">Last updated: {LAST_UPDATED}</p>
      <p>
        These terms apply when you use this website to post a property, search listings, save properties or send an
        enquiry to {site.name} (&quot;we&quot;, &quot;us&quot;). By using the website you agree to them.
      </p>

      <h2>Our role</h2>
      <p>
        {site.name} is a property brokerage. We list properties on behalf of their owners and connect buyers and
        tenants with our team. Every enquiry comes to us, not to the owner. Any sale or rental is agreed directly
        between the parties, and our brokerage fees are agreed separately in writing.
      </p>

      <h2>Your account</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>You sign in with your mobile number and a one-time code sent on WhatsApp. Keep your phone secure.</li>
        <li>Use only a number that belongs to you, and give accurate details.</li>
        <li>You must be 18 or older to use the website.</li>
      </ul>

      <h2>Posting a property</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>You must own the property or have the owner&apos;s permission to list it.</li>
        <li>Details, prices and photos must be true and must not mislead. Photos must be your own or used with permission.</li>
        <li>
          We review every listing and may verify it on site before publishing. We may edit, decline, hide or remove a
          listing that is inaccurate, duplicated, unlawful or no longer available.
        </li>
        <li>Listings expire after a set period unless renewed. Tell us when the property is sold or let.</li>
        <li>
          You let us show your listing details and photos on this website and in our marketing of the property. We never
          publish your name, phone number or exact address.
        </li>
      </ul>

      <h2>Searching and enquiring</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          Listings come from owners. We check them, but we can&apos;t guarantee every detail. Confirm the price,
          documents, approvals and condition before you decide.
        </li>
        <li>Send genuine enquiries only. Don&apos;t use the website to spam, scrape data or contact owners around us.</li>
      </ul>

      <h2>WhatsApp messages</h2>
      <p>
        By signing in, posting a property or sending an enquiry, you agree that we may contact you on WhatsApp about it:
        sign-in codes, listing updates, replies to enquiries and visit scheduling. Reply <strong>STOP</strong> to stop
        update messages. See our <Link href="/privacy" className="underline">privacy policy</Link> for how we handle
        your information.
      </p>

      <h2>Limits on our responsibility</h2>
      <p>
        We provide the website as it is and try to keep it accurate and available, but we are not responsible for
        losses caused by errors in listings supplied by owners, by interruptions to the website or WhatsApp, or by
        dealings between buyers, tenants and owners. Nothing in these terms limits rights you have under Indian law.
      </p>

      <h2>Changes and governing law</h2>
      <p>
        We may update these terms; the date above shows the latest version. These terms are governed by the laws of
        India, and the courts of Mangaluru, Karnataka have jurisdiction.
      </p>

      <h2>Contact us</h2>
      <p>
        Questions about these terms: contact {site.name} at {contact}
        {address ? `, or write to us at ${address}` : ""}.
      </p>
    </article>
  );
}
