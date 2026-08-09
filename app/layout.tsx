import './globals.css';
import type { Metadata } from 'next';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';

export const metadata: Metadata = {
  title: { default: 'The Hillside Gardens', template: '%s | The Hillside Gardens' },
  description: 'Plants, teas, botanicals, handmade body care and plant education from The Hillside Gardens.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000')
};

export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="en"><body><SiteHeader/><main>{children}</main><SiteFooter/></body></html>
}
