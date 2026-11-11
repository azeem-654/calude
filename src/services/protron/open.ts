/** Opening Protron from anywhere in the app — a button, a link, another screen. */
export const PROTRON_OPEN = 'pc-protron-open';

/** Opens Protron's panel, optionally sending a first message for the customer. */
export function openProtron(message?: string): void {
  window.dispatchEvent(new CustomEvent(PROTRON_OPEN, { detail: { message } }));
}
