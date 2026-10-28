/**
 * The software plans' billing terms, shared by PricingParts.tsx, /pricing and
 * the home page. Kept out of the component file so it exports components only.
 */
import { CARD_PLANS, type PlanTable } from '../../services/allowances';

/** Whether any plan on sale has a yearly price — the switch is pointless otherwise. */
export const hasYearly = (table: PlanTable) => CARD_PLANS(table.plans).some(p => p.kind === 'self' && p.annualCents > 0);

/** The recurring terms, said once under every priced card. */
export const BILLING_TERMS = 'USD, billed monthly after the 7-day trial · renews each month until you cancel';
