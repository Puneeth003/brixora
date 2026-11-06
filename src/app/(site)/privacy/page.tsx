import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `How ${site.name} collects, uses and protects your personal information.`,
};

const LAST_UPDATED = "6 November 2026";

export default function PrivacyPage() {
  const { email, phone, address } = site.brokerage;
  const contact = email || phone || "our office";
  return (
    <article className="container-page max-w-3xl space-y-6 py-12 text-zinc-700 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-900">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Privacy policy</h1>
      <p className="text-sm text-zinc-500">Last updated: {LAST_UPDATED}</p>
      <p>
        {site.name} (&quot;we&quot;, &quot;us&quot;) runs this website to list properties on behalf of owners and to
        connect buyers and tenants with our team. This policy explains what personal information we collect, why, and
        the choices you have. It is written to meet India&apos;s Digital Personal Data Protection Act, 2023.
      </p>

      <h2>What we collect</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Account and sign-in:</strong> your name and mobile number. We verify the number with a one-time code
          sent on WhatsApp. We also record when you last signed in.
        </li>
        <li>
          <strong>Property owners:</strong> the property address, details and photos you submit, and any changes you
          request later.
        </li>
        <li>
          <strong>Enquiries:</strong> your name, mobile number, message and the property you asked about, plus any
          follow-up messages between you and our team.
        </li>
        <li>
          <strong>Saved properties:</strong> the listings you save while signed in.
        </li>
        <li>
          <strong>Site visits:</strong> when our team verifies a property in person, we record the visit, a checklist,
          photos and the location of the visit.
        </li>
        <li>
          <strong>Technical data:</strong> your IP address and browser details when you sign in, and standard server
          logs. We use these to keep accounts secure and to block repeated failed sign-in attempts.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>To verify your number, sign you in and keep your account secure.</li>
        <li>To review, verify and publish your listing.</li>
        <li>
          To send you WhatsApp messages about your listing: submission received, approval or rejection, change requests
          and sale confirmation.
        </li>
        <li>To reply to your enquiry and call you back about properties that match what you are looking for.</li>
        <li>To keep records of our work as a brokerage, as required by law.</li>
      </ul>
      <p>
        We use your information only for these purposes. When you submit a listing or an enquiry, you consent to us
        using it this way.
      </p>

      <h2>What we never publish</h2>
      <p>
        Owner names, phone numbers and exact addresses are never shown on the website or shared with buyers. Listings
        show the locality only. Every enquiry comes to our team, not to the owner. Photos are re-processed before they
        are published, which removes hidden data such as the camera&apos;s location.
      </p>

      <h2>WhatsApp and email</h2>
      <p>
        We send messages through the official WhatsApp Business Platform. You can reply <strong>STOP</strong> at any
        time to stop update messages. We will still send sign-in codes you request and important notices about your
        listing. If you have a staff or partner account, we may also email you about your account, such as password
        reset codes.
      </p>

      <h2>Cookies</h2>
      <p>
        We use only the cookies needed to keep you signed in. They hold a random sign-in token and are removed when you
        sign out, or after 30 days at most. We do not use advertising or tracking cookies.
      </p>

      <h2>Who we share it with</h2>
      <p>
        We use trusted service providers to run the site: Hostinger (hosting, database and photo storage), Meta
        (WhatsApp messaging) and our email provider. They process data only to provide these services. Our own agents
        and partner brokers see the enquiries assigned to them. We may also share information when the law requires
        it. We do not sell your data.
      </p>

      <h2>How we protect it</h2>
      <p>
        Your information is stored on secured servers, and only our authorised team members can access it. Passwords
        and sign-in tokens are stored in a scrambled (hashed) form, never as plain text.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep listing and enquiry records while the listing is active and for a reasonable period afterwards for our
        records and legal obligations, unless you ask us to delete them.
      </p>

      <h2>Your rights</h2>
      <p>You can ask us to:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>tell you what information we hold about you;</li>
        <li>correct or update it;</li>
        <li>delete it, or remove your listing;</li>
        <li>stop using it, by withdrawing your consent.</li>
      </ul>
      <p>
        Contact {contact} and we will respond within a reasonable time. If you are not satisfied with our response,
        you can complain to the Data Protection Board of India.
      </p>

      <h2>Children</h2>
      <p>This website is not meant for anyone under 18, and we do not knowingly collect their information.</p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy from time to time. The date at the top of this page shows when it last changed.
      </p>

      <h2>Contact us</h2>
      <p>
        For any privacy question or complaint, contact {site.name} at {contact}
        {address ? `, or write to us at ${address}` : ""}.
      </p>
    </article>
  );
}
