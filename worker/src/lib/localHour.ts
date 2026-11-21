/**
 * The customer's own local hour.
 *
 * The timezone comes from their booking page, which is the one place in this
 * app a real IANA zone is already stored — taken from their browser when they
 * set their availability. No timezone means UTC, and the digest still goes;
 * arriving at the wrong hour is a much smaller failure than not arriving.
 */
export function localHour(tz: string): number {
  try {
    const h = new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC', hour: 'numeric', hour12: false })
      .format(new Date());
    const n = Number(h);
    return Number.isFinite(n) ? n : new Date().getUTCHours();
  } catch {
    /* An unknown zone throws rather than falling back, and a workspace whose
       stored zone is nonsense should still get its digest. */
    return new Date().getUTCHours();
  }
}

