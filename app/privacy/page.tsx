export const metadata = {
  title: 'Privacy Policy',
  description: 'Privacy policy for The Hillside Gardens website, shop, classes and contact forms.'
};

export default function PrivacyPage() {
  return (
    <>
      <section className="pagehero">
        <div className="container"><div className="eyebrow">Website information</div><h1>Privacy policy.</h1><p>How information is collected and used by The Hillside Gardens.</p></div>
      </section>
      <section className="content">
        <article className="narrow prose">
          <p><strong>Effective August 9, 2026.</strong></p>
          <h2>Information collected</h2>
          <p>The Hillside Gardens may collect information a visitor provides when placing an order, registering for a class, joining the email list, checking an order or sending a message. This may include a name, email address, phone number, billing and shipping address, order details, class selections and message content.</p>
          <p>The website and its hosting, payment and email providers may also process technical information such as IP address, device or browser details, timestamps, security logs and cookies necessary to operate and protect the service.</p>

          <h2>Payments</h2>
          <p>Payments are processed by Stripe. The Hillside Gardens does not receive or store a customer’s complete card number or card security code. Stripe processes payment and billing data under its own privacy terms.</p>

          <h2>How information is used</h2>
          <p>Information may be used to process and fulfill purchases, create invoices and shipping labels, provide order or class updates, answer questions, prevent fraud, maintain business records, improve the website and send marketing email when a person has subscribed or opted in.</p>

          <h2>Service providers</h2>
          <p>Information may be shared with providers that help operate the business, including website hosting and database providers, Stripe, email-delivery services and shipping carriers. These providers receive only the information reasonably needed for their services.</p>

          <h2>Affiliate links</h2>
          <p>Tammy’s Picks may contain Amazon or other affiliate links. An affiliate platform may use cookies or similar technologies to attribute a purchase after a visitor follows a link. Those platforms control their own tracking and privacy practices.</p>

          <h2>Retention and security</h2>
          <p>Business records are retained for as long as reasonably needed for fulfillment, customer service, accounting, tax, legal and security purposes. Reasonable administrative and technical safeguards are used, but no online system can promise absolute security.</p>

          <h2>Your choices</h2>
          <p>Subscribers may ask to stop marketing email at any time. Customers may also request access, correction or deletion of information, subject to records The Hillside Gardens must retain for legitimate business or legal reasons.</p>

          <h2>Children</h2>
          <p>This website is not directed to children under 13, and The Hillside Gardens does not knowingly collect personal information from children under 13.</p>

          <h2>Contact</h2>
          <p>Privacy questions can be sent to <a className="text-link" href="mailto:hello@thehillsidegarden.com">hello@thehillsidegarden.com</a>.</p>
        </article>
      </section>
    </>
  );
}
