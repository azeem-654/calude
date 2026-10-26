/**
 * Which industry microsite a component is on (Microsite.tsx provides it).
 * Kept apart from the layout so that file exports only components.
 */
import { createContext, useContext } from 'react';
import type { SiteSource } from '../../../worker/src/lib/strategyCall';

export interface MicrositeConfig {
  id: Exclude<SiteSource, 'main'>;
  /** The microsite's own home: where the logo and "Home" go. */
  root: string;
  /** Shown beside the logo: "HVAC", "Roofing", "Medical Billing". */
  tag: string;
  /** In-page sections, in reading order. */
  nav: { href: string; label: string }[];
  /** The booking button's words on this site. */
  bookLabel: string;
  bookShort: string;
  /** The page's own inquiry form, and its words — where the booking buttons go while bookings are closed. */
  writeHref: string;
  writeLabel: string;
  footerLine: string;
  /** Show "Sign in" (the trade sites sell an app login; the RCM site does not yet). */
  signIn: boolean;
}

export const MicrositeContext = createContext<MicrositeConfig | null>(null);
export const useMicrosite = () => useContext(MicrositeContext);
