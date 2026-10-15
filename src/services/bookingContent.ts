/**
 * The booking page's words, points and colour, from the browser's side. The
 * rules live in the Worker's own file (worker/src/lib/bookingContent.ts), so
 * the editor, the page and the server's publish read a config one way.
 */
export * from '../../worker/src/lib/bookingContent';
