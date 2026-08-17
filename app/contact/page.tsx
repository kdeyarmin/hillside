import { Clock3, Mail, MapPin, Sprout } from 'lucide-react';
import ContactForm from '@/components/ContactForm';
import { CLASSES_PUBLICLY_VISIBLE } from '@/lib/class-visibility';
import { parseContactPrefill } from '@/lib/contact';
import { businessEmail } from '@/lib/store';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/contact',
  title: 'Contact us',
  description: 'Contact The Hillside Gardens about plants, products, orders or custom arrangements.'
});

export default async function ContactPage({
  searchParams
}: {
  searchParams: Promise<{ subject?: string; message?: string }>;
}) {
  const email = businessEmail();
  const prefill = parseContactPrefill(await searchParams, CLASSES_PUBLICLY_VISIBLE);
  return (
    <>
      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">Let’s talk plants</div>
          <h1>Contact us.</h1>
          <p>
            Questions about a plant, an order or a custom planter? Send a note directly to The
            Hillside Gardens.
          </p>
        </div>
      </section>
      <section className="content">
        <div className="container contact-grid">
          <div>
            <div className="eyebrow">The Hillside Gardens</div>
            <h2
              className="display-title"
              style={{ color: 'var(--forest)', fontSize: 46, margin: '8px 0 16px' }}
            >
              Friendly help from a real plant person.
            </h2>
            <p className="muted">
              Messages from this form come straight to us, and we respond directly to the email
              address you provide.
            </p>
            <div className="info-list">
              <div className="info-item">
                <Mail size={20} />
                <b>Email</b>
                <a className="text-link" href={`mailto:${email}`}>
                  {email}
                </a>
              </div>
              <div className="info-item">
                <Clock3 size={20} />
                <b>Response time</b>
                <span>Most messages are answered within two business days.</span>
              </div>
              <div className="info-item">
                <Sprout size={20} />
                <b>Plant questions</b>
                <span>
                  Include the plant name, lighting conditions and a clear photo when possible.
                </span>
              </div>
              <div className="info-item">
                <MapPin size={20} />
                <b>Local pickup</b>
                <span>
                  Pickup is arranged through this form. Exact details are shared directly with
                  confirmed customers.
                </span>
              </div>
            </div>
          </div>
          <ContactForm initialSubject={prefill.subject} initialMessage={prefill.message} />
        </div>
      </section>
    </>
  );
}
