'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

/**
 * Google Analytics 4 with ecommerce events. Renders nothing at all when no
 * measurement id is configured, so local and preview builds stay untracked.
 */
export default function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!MEASUREMENT_ID || typeof window === 'undefined') return;
    window.gtag?.('event', 'page_view', { page_path: pathname });
  }, [pathname]);

  if (!MEASUREMENT_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="hillside-ga4" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${MEASUREMENT_ID}',{send_page_view:false});`}
      </Script>
    </>
  );
}
