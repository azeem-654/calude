#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Is the live site reachable, and if not, why?
#
#   ./scripts/site-check.sh [domain]
#
# Run it locally, or let CI run it — the point of running it from CI is that
# GitHub's network is neither your machine nor the host's, which is the only way
# to tell "the site is down" apart from "the site is down for me".
#
# A timeout on 443 can mean an expired certificate, a listener that is not
# running, or a firewall dropping packets. Those have three different fixes, so
# this separates them rather than reporting one undifferentiated failure.
#
# Read-only: it never writes to the server.
# ──────────────────────────────────────────────────────────────────────────────
set -uo pipefail

DOMAIN="${1:-protectedcentral.com}"
# Outside CI the summary goes to a scratch file and the terminal still gets it.
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
say() { printf '%s\n' "$1" >> "$SUMMARY"; printf '%s\n' "$1"; }

FAULTS=()

say "## 🔎 \`$DOMAIN\` from $( [ -n "${GITHUB_ACTIONS:-}" ] && echo "GitHub's network" || echo "this machine" )"
say ""

# ── DNS ──────────────────────────────────────────────────────────────────────
APEX_IPS=$(getent hosts "$DOMAIN"     2>/dev/null | awk '{print $1}' | tr '\n' ' ')
WWW_IPS=$( getent hosts "www.$DOMAIN" 2>/dev/null | awk '{print $1}' | tr '\n' ' ')

say "### DNS"
say ""
say "| Name | Resolves to |"
say "|------|-------------|"
say "| \`$DOMAIN\` | \`${APEX_IPS:-NOT RESOLVING}\` |"
say "| \`www.$DOMAIN\` | \`${WWW_IPS:-NOT RESOLVING}\` |"
say ""

if [ -z "$APEX_IPS" ]; then
  say "**DNS does not resolve.** Nothing else can work until it does — check the"
  say "nameservers at the registrar and the zone in the Freehostia panel."
  exit 0
fi

# Connect over IPv4. `getent hosts` returns AAAA first when both exist, and a
# runner without IPv6 egress would report every port filtered for the wrong
# reason. Fall back to whatever resolved if there is no A record at all.
IP=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1; exit}')
IP="${IP:-$(echo "$APEX_IPS" | awk '{print $1}')}"

# ── Ports ────────────────────────────────────────────────────────────────────
# Refused and filtered are different faults. Refused means the machine is up and
# nothing is bound to the port; filtered means the packets are being swallowed.
say "### Ports on \`$IP\`"
say ""
say "| Port | Service | Result | Meaning |"
say "|------|---------|--------|---------|"

PORT_443=""
port() {
  local p="$1" name="$2" rc
  timeout 12 bash -c "exec 3<>/dev/tcp/$IP/$p" 2>/dev/null; rc=$?
  case $rc in
    0)   say "| $p | $name | ✅ open | accepting connections |";            [ "$p" = 443 ] && PORT_443=open ;;
    124) say "| $p | $name | ⛔ filtered | packets dropped — firewall, or nothing bound |"; [ "$p" = 443 ] && PORT_443=filtered ;;
    *)   say "| $p | $name | ❌ refused | machine is up, nothing listening here |"; [ "$p" = 443 ] && PORT_443=refused ;;
  esac
  return 0
}
port 80  HTTP
port 443 HTTPS
port 21  FTP
say ""

# ── TLS ──────────────────────────────────────────────────────────────────────
say "### TLS certificate"
say ""
if [ "$PORT_443" != "open" ]; then
  say "Skipped — port 443 is **$PORT_443**, so there is no listener to hand one over."
  say ""
  say "This is not a certificate problem. The HTTPS service itself is not answering."
  FAULTS+=("HTTPS (port 443) is $PORT_443 — the listener is down at the host")
elif timeout 20 openssl s_client -connect "$IP:443" -servername "$DOMAIN" \
       </dev/null >/tmp/tls.pem 2>/tmp/tls.err; then
  SUBJ=$(openssl x509 -noout -subject -in /tmp/tls.pem 2>/dev/null | sed 's/^subject=//')
  ISSU=$(openssl x509 -noout -issuer  -in /tmp/tls.pem 2>/dev/null | sed 's/^issuer=//')
  ENDS=$(openssl x509 -noout -enddate -in /tmp/tls.pem 2>/dev/null | sed 's/^notAfter=//')
  say "| Field | Value |"
  say "|-------|-------|"
  say "| Subject | \`${SUBJ:-—}\` |"
  say "| Issuer | \`${ISSU:-—}\` |"
  say "| Expires | \`${ENDS:-—}\` |"
  if ! openssl x509 -noout -checkend 0 -in /tmp/tls.pem >/dev/null 2>&1; then
    say ""
    say "⚠️ **The certificate has expired.**"
    FAULTS+=("the TLS certificate expired on $ENDS")
  elif ! openssl x509 -noout -checkend 604800 -in /tmp/tls.pem >/dev/null 2>&1; then
    say ""
    say "⚠️ **The certificate expires within 7 days** ($ENDS)."
  fi
else
  say "❌ **The handshake failed.** \`$(tr -d '\n' </tmp/tls.err | cut -c1-160)\`"
  FAULTS+=("port 443 accepts connections but the TLS handshake fails")
fi
say ""

# ── Requests ─────────────────────────────────────────────────────────────────
say "### Requests"
say ""
say "| URL | Status | Time | Redirects to | Error |"
say "|-----|--------|------|--------------|-------|"
probe() {
  local url="$1" body="${2:-/dev/null}" out code secs redir
  out=$(curl -sS -o "$body" -m 25 -w '%{http_code}|%{time_total}|%{redirect_url}' \
          "$url" 2>/tmp/curl.err) || true
  if [ -z "$out" ]; then
    say "| \`$url\` | — | — | — | $(tr -d '\n' </tmp/curl.err | cut -c1-70) |"
  else
    IFS='|' read -r code secs redir <<< "$out"
    say "| \`$url\` | $code | ${secs}s | ${redir:-—} | |"
  fi
  return 0
}
probe "http://$DOMAIN/" /tmp/body.html
probe "https://$DOMAIN/"
probe "http://www.$DOMAIN/"
probe "http://$DOMAIN/api/auth.php?action=status"
say ""

# ── HSTS ─────────────────────────────────────────────────────────────────────
# If the host ever sent HSTS while 443 worked, browsers have pinned it and will
# refuse plain HTTP — which makes a dead 443 look like a total outage even while
# port 80 serves the site perfectly well.
say "### HSTS"
say ""
HSTS=$(curl -sSI -m 20 "http://$DOMAIN/" 2>/dev/null | grep -i '^strict-transport-security' || true)
if [ -n "$HSTS" ]; then
  say "\`$HSTS\`"
  say ""
  say "⚠️ HSTS is being sent, so browsers will **refuse** to fall back to HTTP."
  FAULTS+=("HSTS is being sent, which blocks the HTTP fallback")
else
  say "Not sent over HTTP. If a browser still refuses plain HTTP it pinned HSTS from"
  say "an earlier HTTPS visit — clear it at \`chrome://net-internals/#hsts\`."
fi
say ""

# ── What is actually deployed ────────────────────────────────────────────────
say "### Deployed build"
say ""
ASSET=$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' /tmp/body.html 2>/dev/null | head -1)
say "Bundle served over HTTP: \`${ASSET:-could not read index.html}\`"
say ""

# ── Verdict ──────────────────────────────────────────────────────────────────
say "### Verdict"
say ""
if [ ${#FAULTS[@]} -eq 0 ]; then
  say "No fault found — the site answers on both ports with a valid certificate."
else
  for f in "${FAULTS[@]}"; do say "- $f"; done
  say ""
  say "Everything above is on the hosting side. Nothing in this repository can fix"
  say "it; it needs the Freehostia control panel or their support."
fi
exit 0
