/**
 * The software plans' billing terms, shared by PricingParts.tsx, /pricing and
 * the home page. Kept out of the component file so it exports components only.
 */
import { CARD_PLANS, type PlanTable } from '../../services/allowances';

/** Whether any plan on sale has a yearly price — the switch is pointless otherwise. */
export const hasYearly = (table: PlanTable) => CARD_PLANS(table.plans).some(p => p.kind === 'self' && p.annualCents > 0);

/** The recurring terms, said once under every priced card. */
export const BILLING_TERMS = 'USD, billed monthly or yearly after the 7-day trial · renews each period until you cancel';

/** The same terms as a clause inside a sentence ("7 days free, no card; then …"). */
export const BILLING_CLAUSE = 'billed monthly or yearly in US dollars, renewing each period until you cancel';
