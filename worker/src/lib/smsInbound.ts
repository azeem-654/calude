/**
 * Which workspace an inbound text belongs to (T-2).
 *
 * More than one workspace can have typed the same sending number. Inbound
 * took the first matching row and checked Twilio's signature with that row's
 * token, so when the wrong row came first a real STOP failed the check and
 * was never recorded — somebody kept being texted after saying stop. Every
 * candidate is tried, the one whose Account SID Twilio named first, and the
 * owner is the one whose token the signature proves. Pure, for the test.
 */
export interface InboundCandidate { accountId: string; accountSid: string; authToken: string }

export async function inboundOwner(
  candidates: InboundCandidate[],
  formAccountSid: string,
  signedWith: (authToken: string) => Promise<boolean>,
): Promise<string | null> {
  const sid = formAccountSid.trim();
  const ordered = [...candidates].sort((a, b) => Number(b.accountSid === sid) - Number(a.accountSid === sid));
  for (const c of ordered) {
    if (c.authToken && await signedWith(c.authToken)) return c.accountId;
  }
  return null;
}
