# Telnyx Video online classes

The Hillside Gardens supports in-person, online and hybrid classes. Online attendees register on the public class page, receive a private Hillside link by email and join a browser-based Telnyx Video room. Tammy opens the same room from the authenticated host studio.

## Railway variables

Add these to the **hillside web service** in Railway:

```text
TELNYX_API_KEY=KEY_FROM_TELNYX_MISSION_CONTROL
TELNYX_API_BASE_URL=https://api.telnyx.com/v2
NEXT_PUBLIC_TELNYX_VIDEO_SDK_URL=https://cdn.jsdelivr.net/npm/@telnyx/video@1.0.2/+esm
CLASS_ACCESS_SECRET=A_LONG_RANDOM_SECRET_DIFFERENT_FROM_THE_ADMIN_PASSWORD
CLASS_HOST_NAME=Tammy Hill
```

`TELNYX_API_KEY` is server-only. It is used to create rooms and issue short-lived Telnyx client tokens. The API key is never included in customer emails or browser JavaScript.

Customer email also requires the existing Resend configuration:

```text
SENDGRID_API_KEY=...
EMAIL_FROM=The Hillside Gardens <orders@thehillsidegardens.com>
BUSINESS_EMAIL=hello@thehillsidegardens.com
```

Without Resend, the registration is still saved, but the customer cannot automatically receive the private online-class link. Tammy can resend a confirmation from the host studio after email is configured.

## Creating an online class

1. Sign in at `/admin`.
2. Open **Website content** and scroll to **In-person and online classes**.
3. Choose one of these formats:
   - **In person**
   - **Online through Telnyx Video**
   - **Hybrid: in person + online**
4. Enter the class date, price, seat capacity, duration and registration deadline.
5. Add online instructions such as the supplies customers should have ready.
6. Choose when the online room opens and closes around the scheduled time.
7. Enable recording only when Tammy intends to record and has an appropriate participant notice and consent process.
8. Publish the class.

When `TELNYX_API_KEY` is configured, the application attempts to create the Telnyx room immediately. The room is also created lazily the first time Tammy opens the host studio, so a temporary Telnyx failure does not prevent the class content from being saved.

## Customer registration flow

### Paid class

1. The customer chooses seats and completes Stripe Checkout.
2. The signed Stripe webhook creates the paid class registration.
3. For an online or hybrid class, the app creates a cryptographically random private link and stores only its SHA-256 hash.
4. Resend emails the customer a branded confirmation containing the private Hillside classroom link.

### Free class

1. The customer submits name, email, optional phone and seat count directly on the class page.
2. The server verifies availability and creates a paid-status registration with a zero-dollar amount.
3. The same private-link email is sent through Resend.

The emailed URL is a Hillside access URL, not a Telnyx JWT. Opening it sets a signed, HttpOnly class-access cookie and immediately redirects to a token-free classroom URL. Telnyx client credentials are generated only when the verified customer selects **Join online class**.

## Tammy’s host studio

For each online or hybrid class, use **Open host studio** in `/admin/content` or visit:

```text
/admin/classes/CLASS_ID/studio
```

The host studio allows Tammy to:

- Test Telnyx before the scheduled class
- Join with camera and microphone
- Share her screen
- View registered guests
- See whether confirmation emails were sent
- See when a guest last joined
- Resend a confirmation, which rotates and invalidates the customer’s previous private link and any session established from that link

## Attendee security and room timing

- Only paid-status registrations can enter.
- The emailed bearer token is stored as a one-way hash in PostgreSQL.
- The private URL is removed from the browser address bar before the Telnyx SDK loads.
- The access cookie is HttpOnly, signed, limited to the Hillside domain and bound to the customer’s current emailed token hash.
- Attendees can request Telnyx credentials only during the configured join window.
- Tammy’s authenticated host studio can open outside the attendee window for testing.
- Telnyx client tokens are short-lived and are refreshed by the application during longer classes.

## Recording

Telnyx room recording is disabled by default. When Tammy enables it for a class, the public class card, confirmation email and classroom lobby display a recording notice. The business remains responsible for obtaining any legally required consent and for defining retention, access and deletion practices.

## Launch test

Before advertising the first online class:

1. Add the Telnyx and Resend variables in Railway.
2. Redeploy so Prisma adds the new class fields.
3. Create a low-cost Stripe test-mode online class.
4. Register with a customer test email.
5. Confirm the email arrives and the private link redirects to the classroom.
6. Open Tammy’s host studio in a different browser or device.
7. Verify two-way audio/video, mute, camera controls and screen sharing.
8. Leave the room open for more than 45 minutes to verify token renewal.
9. Test the **Resend link** action and verify the earlier link and earlier browser session no longer work.
10. Test a free online class and a hybrid class.
