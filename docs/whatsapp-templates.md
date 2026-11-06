# WhatsApp templates to submit

Submit each template in WhatsApp Manager → Message templates → Create template. Use:

- **Name**: exactly as written below (the app sends by name).
- **Language**: English (`en`). If you pick "English (US)" (`en_US`) instead, set `WHATSAPP_TEMPLATE_LANG=en_US`.
- **Category**: as listed.
- **Variable type**: Number (`{{1}}`, `{{2}}` …), in the order shown. The app fills them in that order.

Meta rejects a body that starts or ends with a variable, or has two variables next to each other, so each body ends with fixed text. Paste the sample values when Meta asks for them.

---

## 1. `otp_login`: Authentication

Meta writes the text of authentication templates. Choose:

- Code delivery: **Copy code**
- Add security recommendation: **on**
- Add expiry time: **on**, 5 minutes
- Button text: `Copy code`

The app sends the code as `{{1}}` and again on the button.

## 2. `submission_received`: Utility

```
Hi {{1}}, thank you for listing your property with Brixora. Your reference number is {{2}}. Our team will review it and confirm on WhatsApp once it is live.
```
Samples: `Ravi`, `BRX-2026-0042`

## 3. `listing_approved`: Utility

```
Good news! Your property {{1}} is now live on Brixora. View it here: {{2}} . Reply to this message if anything needs to change.
```
Samples: `BRX-2026-0042`, `https://brixora.in/properties/BRX-2026-0042`

## 4. `listing_rejected`: Utility

```
Your property {{1}} could not be published on Brixora. Reason: {{2}}. You can correct this and submit again, or reply here for help.
```
Samples: `BRX-2026-0042`, `Photos are not clear`

## 5. `change_received`: Utility

```
We have received your request for property {{1}}: {{2}}. Our team will review it and confirm on WhatsApp.
```
Samples: `BRX-2026-0042`, `Price change`

## 6. `change_approved`: Utility

```
Your request for property {{1}} ({{2}}) has been approved and the listing is updated on Brixora.
```
Samples: `BRX-2026-0042`, `Price change`

## 7. `change_rejected`: Utility

```
Your request for property {{1}} ({{2}}) was not approved. Reason: {{3}}. Reply here if you have any questions.
```
Samples: `BRX-2026-0042`, `Price change`, `Price is outside the market range`

## 8. `sold_confirmed`: Utility

```
Your property {{1}} is now marked as sold and removed from Brixora. Thank you for choosing us.
```
Sample: `BRX-2026-0042`

## 9. `enquiry_forward`: Utility

Goes to the team number in `BROKERAGE_ENQUIRY_WHATSAPP`, not to customers.

```
New enquiry for property {{1}}.
Name: {{2}}
Phone: {{3}}
Message: {{4}}
Listing: {{5}} .
Reply to the customer from the Brixora admin.
```
Samples: `BRX-2026-0042`, `Anita`, `+91 98450 12345`, `Is this still available?`, `https://brixora.in/properties/BRX-2026-0042`

## 10. `enquiry_reply`: Utility

```
Hi {{1}}, our team has replied to your enquiry about {{2}}. Read and answer it here: {{3}} . Thank you for choosing Brixora.
```
Samples: `Anita`, `BRX-2026-0042`, `https://brixora.in/account/enquiries`

## 11. `site_visit_scheduled`: Utility

```
A site visit for your property {{1}} is scheduled for {{2}}. Our agent will contact you before the visit. Reply here if you need to change the time.
```
Samples: `BRX-2026-0042`, `12 Nov 2026, 11:00 AM`

---

## Tips

- Keep the category **Utility**. Meta may switch a template to Marketing if it reads like a promotion. Marketing templates cost more and are blocked for users who opt out.
- The space before the full stop after a link (`{{2}} .`) keeps the full stop out of the link.
- If a template is rejected, edit the text (not the name or variable order) and resubmit.
- Until a template is approved, sends using it fail and show in Admin → Messages with Meta's error. Retry them there after approval.
