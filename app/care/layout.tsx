/**
 * The care library's stylesheet is 17.5 KB and applies only to these routes, so it
 * loads here rather than in the root layout, where it was being sent to every
 * shopper who never opened a care guide. The handful of `.care-related-*` rules
 * that the product page and site search also render live in `commerce.css`.
 */
import '../care-library.css';

export default function CareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
