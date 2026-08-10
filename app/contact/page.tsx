import { Clock3, Mail, MapPin, Sprout } from 'lucide-react';
import BrandMockupScene from '@/components/BrandMockupScene';
import ContactForm from '@/components/ContactForm';

export const metadata = {
  title: 'Contact us',
  description: 'Contact The Hillside Gardens about plants, planter workshops, products, orders or custom arrangements.'
};

export default function ContactPage() {
  return (
    <>
      <section className="pagehero">
        <div className="container">
          <div className="eyebrow">Let’s talk plants</div>
          <h1>Contact us.</h1>
          <p>Questions about a plant, an order, a class or a custom planter? Send a note directly to The Hillside Gardens.</p>
        </div>
      </section>
      <section className="content">
        <div className="container contact-grid">
          <div>
            <div className="eyebrow">The Hillside Gardens</div>
            <h2 className="display-title" style={{ color: 'var(--forest)', fontSize: 46, margin: '8px 0 16px' }}>
              Friendly help from a real plant person.
            </h2>
            <p className="muted">
              Messages from this form come straight to us, and we respond directly to the email address you provide.
            </p>
            <BrandMockupScene variant="gifts" className="contact-brand-scene" />
            <div className="info-list">
              <div className="info-item"><Mail size={20} /><b>Email</b><a href="mailto:hello@thehillsidegardens.com">hello@thehillsidegardens.com</a></div>
              <div className="info-item"><Clock3 size={20} /><b>Response time</b><span>Most messages are answered within two business days.</span></div>
              <div className="info-item"><Sprout size={20} /><b>Plant questions</b><span>Include the plant name, lighting conditions and a clear photo when possible.</span></div>
              <div className="info-item"><MapPin size={20} /><b>Classes and pickup</b><span>Exact class and pickup details are shared with registered customers.</span></div>
            </div>
          </div>
          <ContactForm />
        </div>
      </section>
    </>
  );
}
