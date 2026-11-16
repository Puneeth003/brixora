# Meta WhatsApp App Review draft

This is draft text for the Brixora Website app's Meta App Review. It is not a submission.

## Service description

Brixora is a Mangalore property listing and brokerage service. Owners submit property listings and change requests; buyers send property enquiries and request site visits; Brixora staff review listings and respond. Brixora uses WhatsApp Cloud API to send one-to-one service messages triggered by these actions, including login verification codes, listing and change-request updates, enquiry notifications, site-visit notices, and staff invitations. Messages use approved WhatsApp templates. Brixora records message delivery status and processes STOP/START replies to manage opt-outs. It does not send bulk promotional messages. Contacts and chat history are not imported.

## `whatsapp_business_messaging`

Brixora needs this permission to send the one-to-one template messages described above from the brokerage's connected WhatsApp Business number. It also receives message-status webhooks so the admin can see whether a message was sent, delivered, read, or failed. The webhook processes STOP/START replies to update the recipient's opt-out setting. Messages are tied to property, enquiry, account, or staff workflows and are not bulk marketing.

## `whatsapp_business_management`

Brixora needs this permission so an authorized administrator can connect the brokerage's WhatsApp Business account through Meta Embedded Signup. The server uses the returned authorization code to obtain a business token, reads the connected number's ID and display details, and subscribes Brixora's webhook to the account. The token is stored encrypted. Brixora does not import contacts or message history. Message templates are created and managed in WhatsApp Manager; Brixora sends approved templates by name.

## Required evidence

Meta's Tech Provider onboarding panel requires two separate videos:

1. Show a message sent from the app and the same message received in WhatsApp. Meta's instructions say to use the app's **Try it out** test number, then demonstrate sending the generated API request from the app.
2. Show a separate message template being created for Brixora's use case.

The Brixora admin has message history and retry screens, but no in-product template-creation screen or test-send control. The live WhatsApp connection is currently blocked by Meta's Tech Provider/App Review gate, so these videos must use Meta's test setup until approval. Do not represent a test send as a production send.

Suggested template wording and variable order are in [whatsapp-templates.md](whatsapp-templates.md).

## Current Meta status

- Business verification: Approved.
- Tech Provider onboarding: 1 of 2 steps complete.
- App Review: Not approved; the dashboard currently shows the review step incomplete and the App Review submissions page says "Not submitted".
- Coexistence signup: Meta error `#3441107`; no production number, token, or phone number ID was returned.

