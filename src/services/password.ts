/**
 * Password rules, in one place.
 *
 * These lived inside the login screen, which was fine while signing up was the
 * only place a password got chosen. Settings → Security now lets someone
 * change their own, and a change-password form that accepts "password1" while
 * the signup form refuses it is worse than having no rules at all — the weak
 * password just moves one screen over.
 *
 * The server re-checks everything here. This is for speed and for saying what
 * is wrong before a round trip, not for security.
 */

const COMMON_PASSWORDS = ['password', 'password1', '12345678', 'qwertyui', 'letmein1', 'welcome1', 'iloveyou', 'admin123'];

/**
 * What is wrong with this password, or '' if nothing is.
 *
 * `name` and `email` are optional because they are only knowable at signup —
 * but when they are known, a password containing either is worth refusing.
 */
export function passwordProblem(password: string, opts: { name?: string; email?: string } = {}): string {
  if (password.length < 8) return 'Use a password of at least 8 characters.';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return 'Include at least one letter and one number in your password.';
  if (COMMON_PASSWORDS.includes(password.toLowerCase())) return 'That password is too common. Choose something harder to guess.';
  /* Only match on something distinctive — a short local part like "real" turns
     up inside perfectly good passwords. */
  const name = (opts.name ?? '').trim();
  if (name.length >= 5 && password.toLowerCase().includes(name.toLowerCase())) return 'Do not put your name in your password.';
  const local = (opts.email ?? '').split('@')[0];
  if (local.length >= 5 && password.toLowerCase().includes(local.toLowerCase())) return 'Do not put your email address in your password.';
  return '';
}

/** How strong the password is, and what would make it stronger. */
export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3; label: string; color: string; hint: string } {
  if (!pw) return { score: 0, label: '', color: '#e2e8f0', hint: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (COMMON_PASSWORDS.includes(pw.toLowerCase())) score = 0;
  const capped = Math.min(3, score) as 0 | 1 | 2 | 3;
  const hint = pw.length < 12
    ? 'Longer is the single biggest improvement — aim for 12 or more characters.'
    : !/[^a-zA-Z0-9]/.test(pw)
      ? 'Adding a symbol would make this harder to guess.'
      : 'Good — long and mixed.';
  return [
    { score: 0 as const, label: 'Too weak', color: '#dc2626', hint },
    { score: 1 as const, label: 'Weak', color: '#f97316', hint },
    { score: 2 as const, label: 'Reasonable', color: '#d97706', hint },
    { score: 3 as const, label: 'Strong', color: '#16a34a', hint },
  ][capped];
}
