import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  const contact = site.brokerage.email || site.brokerage.phone || "our office";
  return (
    <article className="container-page max-w-3xl space-y-6 py-12 text-zinc-700 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-900">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Privacy policy</h1>
      <p>
        {site.name} (&quot;we&quot;) runs this website to list properties on behalf of owners and to connect buyers and
        tenants with our team. This page explains what we collect and how we use it.
      </p>

      <h2>What we collect</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Property owners:</strong> your name, mobile number (verified by a one-time code on WhatsApp), the
          property address and the details and photos you submit.
        </li>
        <li>
          <strong>Enquiries:</strong> your name, mobile number and message when you ask about a property.
        </li>
        <li>
          <strong>Technical data:</strong> standard server logs.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>To verify your number and sign you in.</li>
        <li>
          To send you WhatsApp messages about your listing: submission received, approval or rejection, change requests
          and sale confirmation.
        </li>
        <li>To call you back about a property you enquired about.</li>
      </ul>

      <h2>What we never publish</h2>
      <p>
        Owner names, phone numbers and exact addresses are never shown on the website or shared with buyers. Listings
        show the locality only. Every enquiry comes to our team, not to the owner.
      </p>

      <h2>WhatsApp messages</h2>
      <p>
        We send messages through the official WhatsApp Business Platform. You can reply <strong>STOP</strong> at any
        time to stop update messages. We will still send sign-in codes you request and important notices about your
        listing being declined.
      </p>

      <h2>Who we share it with</h2>
      <p>
        We use trusted service providers to run the site: Hostinger (hosting, database and photo storage) and
        Meta (WhatsApp messaging). They process data only to provide these services. We do not sell
        your data.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep listing and enquiry records while the listing is active and for a reasonable period afterwards for our
        records, unless you ask us to delete them.
      </p>

      <h2>Your choices</h2>
      <p>
        You can ask us to correct or delete your information, or to remove your listing, by contacting {contact}.
      </p>
    </article>
  );
}
