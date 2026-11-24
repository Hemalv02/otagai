# Hackathon demo

[Project overview](../README.md) · [Architecture](architecture.md)

## Walkthrough

The demo uses three accounts with records seeded through the API. Setup requires a demo database, Supabase Auth, media storage, and an AI provider for Ask and translation. [Seed command and configuration](../backend/docs/hackathon-demo.md)

1. **Find help in Nagasaki.** Sign in as Tanaka and open Ask. Describe a shelf that needs installing. Open Rahim’s skill match, or search for his cordless drill and open the listing. To show request creation, continue to a draft, review the details and audience, and confirm the post.
2. **Coordinate across languages.** Open Tanaka’s existing shelf-moving exchange and its chat. Translate a received Bengali message to English. Open the completed exchange to show the thank-you and Rahim’s open request to water his plants, a way to return the favour.
3. **Help family from afar.** Sign in as Rahim and select Amina in Family. Amina already belongs to a building circle in Cumilla. Review her shopping-bag request and show how Rahim can act on her behalf. Switch to Nusrat, the building leader, to see the request from a local member’s side.

To demonstrate the full completion flow, use an open request, agree to an offer, and confirm completion from both accounts. The consented caretaker can then compose a thank-you on Amina’s behalf. The bKash option previews a simulated thank-you payment. Sending the private note saves it through the API. [Family consent](family-consent.md) · [Exchange and thank-you endpoints](../backend/docs/api-endpoints.md)

To see an incoming offer, open Notifications as the requester. Device push depends on platform credentials and a device build. [Push setup](request-push-setup.md)
