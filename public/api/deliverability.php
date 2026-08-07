<?php
/**
 * deliverability.php — the server side of the Email Deliverability engine.
 *
 * Everything here is a real lookup against real infrastructure, because these
 * are the checks a browser physically cannot perform: DNS queries for SPF/DKIM/
 * DMARC/MX, DNSBL blacklist queries, and SMTP mailbox probes. Third-party
 * verification keys live in api/config.php and never reach the browser — the
 * browser asks this endpoint, which holds the key and makes the call.
 *
 * POST JSON { action, token, accountId, ... }:
 *   capabilities                          → what this host can actually do
 *   auth_check   { domain, selectors[] }  → SPF / DKIM / DMARC / MX verdicts
 *   verify       { emails[] }             → per-address verification
 *   blacklist    { host }                 → DNSBL listings for a domain or IP
 *   provider_get                          → which verification provider is set (never the key)
 *   provider_set { provider, apiKey }     → store a key (agency only)
 *
 * Results are cached in the guarded store with a TTL so repeat checks do not
 * hammer DNS or burn verification credits.
 */
require __DIR__ . '/_db.php';
crm_cors();

$d       = json_decode(file_get_contents('php://input'), true) ?? [];
$action  = $d['action'] ?? '';

function out($x) { echo json_encode($x); exit; }

/* ── Host capability probe ───────────────────────────────────────────────── */

function dlv_can_dns()  { return function_exists('dns_get_record') && function_exists('checkdnsrr'); }
function dlv_can_smtp() {
    // Most shared hosts block outbound port 25. Probe a known-good MX once and
    // cache the answer rather than guessing, so the UI can be honest about it.
    $cached = dlv_cache_get('__smtp_probe__', 86400);
    if ($cached !== null) return (bool)($cached['ok'] ?? false);
    $ok = false;
    if (function_exists('fsockopen')) {
        $fp = @fsockopen('gmail-smtp-in.l.google.com', 25, $e, $s, 4);
        if ($fp) { $ok = true; fclose($fp); }
    }
    dlv_cache_put('__smtp_probe__', ['ok' => $ok]);
    return $ok;
}

/* ── Cache (guarded store, TTL per entry) ────────────────────────────────── */

function dlv_cache_get($key, $ttl) {
    $all = crm_store_load('deliverability_cache', []);
    $row = $all[$key] ?? null;
    if (!$row || !isset($row['at'])) return null;
    if (time() - $row['at'] > $ttl) return null;
    return $row['v'];
}
function dlv_cache_put($key, $value) {
    $all = crm_store_load('deliverability_cache', []);
    $all[$key] = ['at' => time(), 'v' => $value];
    // Keep the cache bounded: drop the oldest entries past 800.
    if (count($all) > 800) {
        uasort($all, fn($a, $b) => ($a['at'] ?? 0) <=> ($b['at'] ?? 0));
        $all = array_slice($all, -800, null, true);
    }
    crm_store_save('deliverability_cache', $all);
}

/* ── Input hygiene ───────────────────────────────────────────────────────── */

/** A hostname safe to put in a DNS query. Rejects anything else outright. */
function dlv_clean_host($raw) {
    $h = strtolower(trim((string)$raw));
    $h = preg_replace('#^[a-z]+://#', '', $h);   // tolerate a pasted URL
    $h = explode('/', $h)[0];
    $h = explode(':', $h)[0];
    $h = rtrim($h, '.');
    if ($h === '' || strlen($h) > 253) return '';
    if (!preg_match('/^(?=.{1,253}$)([a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z]{2,63}$/', $h)) return '';
    return $h;
}

function dlv_clean_email($raw) {
    $e = strtolower(trim((string)$raw));
    if (strlen($e) > 254 || substr_count($e, '@') !== 1) return '';
    return $e;
}

/* ── DNS helpers ─────────────────────────────────────────────────────────── */

function dlv_txt($host) {
    if (!dlv_can_dns()) return [];
    $recs = @dns_get_record($host, DNS_TXT);
    if (!is_array($recs)) return [];
    $out = [];
    foreach ($recs as $r) {
        if (isset($r['txt'])) $out[] = $r['txt'];
        elseif (isset($r['entries'])) $out[] = implode('', $r['entries']);
    }
    return $out;
}

function dlv_mx($host) {
    if (!dlv_can_dns()) return [];
    $recs = @dns_get_record($host, DNS_MX);
    if (!is_array($recs)) return [];
    usort($recs, fn($a, $b) => ($a['pri'] ?? 99) <=> ($b['pri'] ?? 99));
    return array_values(array_filter(array_map(fn($r) => [
        'host' => rtrim($r['target'] ?? '', '.'),
        'pri'  => (int)($r['pri'] ?? 0),
    ], $recs), fn($r) => $r['host'] !== ''));
}

/* ── SPF / DKIM / DMARC ──────────────────────────────────────────────────── */

/* Parsing is separated from lookup so the verdict logic can be exercised
   without DNS — the lookups are the part that needs a live network, the
   judgements are the part that needs to be right. */
function dlv_spf($domain) { return dlv_parse_spf(dlv_txt($domain)); }

function dlv_parse_spf($txt) {
    $rec = null;
    foreach ($txt as $t) if (stripos(trim($t), 'v=spf1') === 0) { $rec = trim($t); break; }
    if ($rec === null) {
        return ['status' => 'missing', 'record' => null,
                'message' => 'No SPF record found. Receivers cannot confirm which servers may send as this domain.'];
    }
    // More than one SPF record is a hard failure in the spec, not a warning.
    $count = 0;
    foreach ($txt as $t) if (stripos(trim($t), 'v=spf1') === 0) $count++;
    if ($count > 1) {
        return ['status' => 'error', 'record' => $rec,
                'message' => "Found {$count} SPF records. A domain may publish only one — receivers treat this as a permanent error. Merge them into a single record."];
    }
    $lookups = preg_match_all('/\b(include|a|mx|ptr|exists|redirect)[:=]/i', $rec);
    $all = 'none';
    if (preg_match('/([-~+?])all\b/i', $rec, $m)) $all = $m[1];

    if ($lookups > 10) {
        return ['status' => 'error', 'record' => $rec, 'lookups' => $lookups,
                'message' => "This SPF record needs {$lookups} DNS lookups; the limit is 10. Receivers will fail it. Flatten some includes."];
    }
    if ($all === 'none') {
        return ['status' => 'warn', 'record' => $rec, 'lookups' => $lookups,
                'message' => 'SPF has no "all" mechanism, so it never says what to do with unlisted senders. End it with -all or ~all.'];
    }
    if ($all === '+') {
        return ['status' => 'error', 'record' => $rec, 'lookups' => $lookups,
                'message' => 'This SPF ends in +all, which authorises the entire internet to send as you. Change it to -all.'];
    }
    return ['status' => 'pass', 'record' => $rec, 'lookups' => $lookups, 'qualifier' => $all,
            'message' => $all === '-'
                ? 'SPF is published and strict (-all).'
                : 'SPF is published with a soft fail (~all). Move to -all once you are confident every sender is listed.'];
}

function dlv_dmarc($domain) { return dlv_parse_dmarc(dlv_txt('_dmarc.' . $domain)); }

function dlv_parse_dmarc($txt) {
    $rec = null;
    foreach ($txt as $t) if (stripos(trim($t), 'v=DMARC1') === 0) { $rec = trim($t); break; }
    if ($rec === null) {
        return ['status' => 'missing', 'record' => null,
                'message' => 'No DMARC record. Without it, receivers have no policy to apply when SPF or DKIM fails, and you get no reports.'];
    }
    $p = 'none';
    if (preg_match('/\bp\s*=\s*(none|quarantine|reject)/i', $rec, $m)) $p = strtolower($m[1]);
    $hasRua = (bool)preg_match('/\brua\s*=\s*mailto:/i', $rec);
    $pct = 100;
    if (preg_match('/\bpct\s*=\s*(\d{1,3})/', $rec, $m)) $pct = (int)$m[1];

    if ($p === 'none') {
        return ['status' => 'warn', 'record' => $rec, 'policy' => $p, 'rua' => $hasRua, 'pct' => $pct,
                'message' => 'DMARC is in monitor mode (p=none). It reports but does not protect. Move to quarantine once your reports look clean.'];
    }
    if ($pct < 100) {
        return ['status' => 'warn', 'record' => $rec, 'policy' => $p, 'rua' => $hasRua, 'pct' => $pct,
                'message' => "DMARC policy is {$p} but only applied to {$pct}% of mail. Raise pct to 100 when you are ready."];
    }
    return ['status' => 'pass', 'record' => $rec, 'policy' => $p, 'rua' => $hasRua, 'pct' => $pct,
            'message' => "DMARC is enforcing (p={$p})." . ($hasRua ? '' : ' Add a rua= address so you receive aggregate reports.')];
}

function dlv_dkim($domain, $selectors) {
    $bySelector = [];
    foreach ($selectors as $sel) {
        $sel = preg_replace('/[^a-z0-9._-]/i', '', (string)$sel);
        if ($sel === '') continue;
        $bySelector[$sel] = dlv_txt("{$sel}._domainkey.{$domain}");
    }
    return dlv_parse_dkim($bySelector);
}

function dlv_parse_dkim($bySelector) {
    $found = [];
    foreach ($bySelector as $sel => $txt) {
        foreach ((array)$txt as $t) {
            if (stripos($t, 'v=DKIM1') === false && stripos($t, 'p=') === false) continue;
            $revoked = (bool)preg_match('/\bp\s*=\s*(;|$)/', $t);
            $found[] = ['selector' => $sel, 'record' => trim($t), 'revoked' => $revoked];
            break;
        }
    }
    if (!$found) {
        return ['status' => 'missing', 'selectors' => [],
                'message' => 'No DKIM key found for the selectors checked. Add your provider\'s selector, or publish a key.'];
    }
    foreach ($found as $f) {
        if ($f['revoked']) {
            return ['status' => 'error', 'selectors' => $found,
                    'message' => "The DKIM key for selector \"{$f['selector']}\" has an empty p= value, which means revoked. Signatures using it will fail."];
        }
    }
    $names = implode(', ', array_column($found, 'selector'));
    return ['status' => 'pass', 'selectors' => $found,
            'message' => 'DKIM key published for selector ' . $names . '.'];
}

/* ── DNSBL blacklist checks ──────────────────────────────────────────────── */

const DLV_DNSBL = [
    ['zone' => 'zen.spamhaus.org',        'name' => 'Spamhaus ZEN',      'delist' => 'https://check.spamhaus.org/'],
    ['zone' => 'b.barracudacentral.org',  'name' => 'Barracuda',         'delist' => 'https://www.barracudacentral.org/rbl/removal-request'],
    ['zone' => 'bl.spamcop.net',          'name' => 'SpamCop',           'delist' => 'https://www.spamcop.net/bl.shtml'],
    ['zone' => 'dnsbl.sorbs.net',         'name' => 'SORBS',             'delist' => 'https://www.sorbs.net/lookup.shtml'],
    ['zone' => 'psbl.surriel.com',        'name' => 'PSBL',              'delist' => 'https://psbl.org/remove'],
];

function dlv_reverse_ip($ip) { return implode('.', array_reverse(explode('.', $ip))); }

function dlv_blacklist($host) {
    // Domain in, IPs out: a domain's reputation is really its sending IPs'.
    $ips = [];
    if (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        $ips = [$host];
    } elseif (dlv_can_dns()) {
        $a = @dns_get_record($host, DNS_A);
        if (is_array($a)) foreach ($a as $r) if (!empty($r['ip'])) $ips[] = $r['ip'];
    }
    $ips = array_slice(array_unique($ips), 0, 4);

    $results = [];
    foreach ($ips as $ip) {
        $rev = dlv_reverse_ip($ip);
        foreach (DLV_DNSBL as $bl) {
            $listed = dlv_can_dns() ? @checkdnsrr("{$rev}.{$bl['zone']}", 'A') : false;
            $results[] = [
                'ip' => $ip, 'list' => $bl['name'], 'zone' => $bl['zone'],
                'listed' => (bool)$listed, 'delistUrl' => $bl['delist'],
            ];
        }
    }
    $listed = array_values(array_filter($results, fn($r) => $r['listed']));
    return [
        'ips' => $ips,
        'checked' => count($results),
        'results' => $results,
        'listedCount' => count($listed),
        'status' => !$ips ? 'unknown' : (count($listed) ? 'error' : 'pass'),
        'message' => !$ips
            ? 'Could not resolve any IP for this host, so blacklists could not be checked.'
            : (count($listed)
                ? 'Listed on ' . count($listed) . ' blacklist(s). Delivery will suffer until you are delisted.'
                : 'Not listed on any of the ' . count(DLV_DNSBL) . ' blacklists checked.'),
    ];
}

/* ── Address verification ────────────────────────────────────────────────── */

/** Disposable-domain list. Bundled so the check works with no third party. */
function dlv_disposable_domains() {
    static $set = null;
    if ($set !== null) return $set;
    $raw = 'mailinator.com 10minutemail.com guerrillamail.com guerrillamail.net sharklasers.com grr.la '
         . 'temp-mail.org tempmail.com throwawaymail.com yopmail.com yopmail.fr trashmail.com trashmail.de '
         . 'dispostable.com fakeinbox.com getairmail.com mytemp.email tempinbox.com maildrop.cc '
         . 'moakt.com mohmal.com emailondeck.com spamgourmet.com mailnesia.com harakirimail.com '
         . 'anonbox.net burnermail.io tempr.email discard.email spam4.me inboxbear.com '
         . 'nowmymail.com mailcatch.com jetable.org tempmailo.com luxusmail.org 1secmail.com '
         . 'einrot.com cuvox.de dayrep.com armyspy.com teleworm.us superrito.com gustr.com '
         . 'fleckens.hu jourrapide.com rhyta.com msgsafe.io mailpoof.com tempsky.com';
    $set = array_flip(preg_split('/\s+/', trim($raw)));
    return $set;
}

const DLV_ROLE_LOCAL = [
    'admin', 'administrator', 'info', 'sales', 'support', 'contact', 'help', 'billing',
    'accounts', 'accounting', 'office', 'hello', 'team', 'marketing', 'noreply', 'no-reply',
    'donotreply', 'postmaster', 'webmaster', 'hostmaster', 'abuse', 'security', 'privacy',
    'legal', 'careers', 'jobs', 'hr', 'press', 'media', 'enquiries', 'inquiries', 'service',
];

/** Local-part patterns that ISPs commonly recycle into spam traps. */
function dlv_trap_risk($local, $domain) {
    $reasons = [];
    if (preg_match('/^(spam|trap|abuse|honeypot|spamtrap)/', $local)) $reasons[] = 'local part looks like a trap address';
    if (preg_match('/^[a-z]{1,3}\d{5,}$/', $local)) $reasons[] = 'random letters-and-digits pattern typical of harvested addresses';
    if (in_array($domain, ['aol.com', 'netscape.net', 'cs.com', 'compuserve.com', 'excite.com', 'juno.com', 'love.com', 'games.com'], true)) {
        $reasons[] = 'domain is a long-dormant provider whose old mailboxes are often recycled as traps';
    }
    return $reasons;
}

function dlv_verify_one($email, $doSmtp) {
    $e = dlv_clean_email($email);
    $res = [
        'email' => $email, 'normalized' => $e,
        'syntax' => false, 'domain' => '', 'mx' => [], 'hasMx' => false,
        'disposable' => false, 'role' => false, 'free' => false,
        'trapRisk' => [], 'smtp' => null,
        'verdict' => 'invalid', 'score' => 0, 'reasons' => [],
    ];
    if ($e === '' || !filter_var($e, FILTER_VALIDATE_EMAIL)) {
        $res['reasons'][] = 'The address is not a valid email format.';
        return $res;
    }
    $res['syntax'] = true;
    [$local, $domain] = explode('@', $e, 2);
    $res['domain'] = $domain;

    $mx = dlv_mx($domain);
    $res['mx'] = array_slice(array_column($mx, 'host'), 0, 3);
    $res['hasMx'] = count($mx) > 0;
    if (!$res['hasMx'] && dlv_can_dns()) {
        // RFC 5321: with no MX, an A record may still accept mail.
        $res['hasMx'] = (bool)@checkdnsrr($domain, 'A');
        if ($res['hasMx']) $res['mx'] = [$domain];
    }

    $res['disposable'] = isset(dlv_disposable_domains()[$domain]);
    $res['role'] = in_array($local, DLV_ROLE_LOCAL, true);
    $res['free'] = in_array($domain, ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'aol.com', 'icloud.com', 'gmx.com', 'proton.me', 'protonmail.com'], true);
    $res['trapRisk'] = dlv_trap_risk($local, $domain);

    if (!$res['hasMx']) {
        $res['verdict'] = 'invalid';
        $res['reasons'][] = dlv_can_dns()
            ? "The domain {$domain} has no mail server, so nothing can be delivered there."
            : 'DNS lookups are unavailable on this host, so the domain could not be checked.';
        return $res;
    }

    if ($doSmtp && $mx) {
        $res['smtp'] = dlv_smtp_probe($mx[0]['host'], $e);
    }

    // Score, then translate to a verdict.
    $score = 70;
    if ($res['smtp'] === 'accepted') $score += 25;
    if ($res['smtp'] === 'rejected') { $score = 5; $res['reasons'][] = 'The mail server said this mailbox does not exist.'; }
    if ($res['disposable']) { $score -= 55; $res['reasons'][] = 'This is a disposable address — it will stop existing shortly.'; }
    if ($res['role'])       { $score -= 25; $res['reasons'][] = "\"{$local}@\" is a role address, usually read by several people and quick to mark mail as spam."; }
    if ($res['trapRisk'])   { $score -= 40; foreach ($res['trapRisk'] as $r) $res['reasons'][] = 'Possible spam trap: ' . $r . '.'; }

    $res['score'] = max(0, min(100, $score));
    $res['verdict'] = $res['score'] >= 70 ? 'valid' : ($res['score'] >= 40 ? 'risky' : 'invalid');
    if (!$res['reasons']) $res['reasons'][] = "The domain accepts mail and nothing about this address looks risky.";
    return $res;
}

/** Real SMTP conversation: does the server accept RCPT TO for this mailbox? */
function dlv_smtp_probe($mxHost, $email) {
    $fp = @fsockopen($mxHost, 25, $errno, $errstr, 6);
    if (!$fp) return 'unreachable';
    stream_set_timeout($fp, 6);
    $read = function () use ($fp) {
        $out = '';
        while (($line = fgets($fp, 515)) !== false) {
            $out .= $line;
            if (strlen($line) < 4 || $line[3] !== '-') break;
        }
        return $out;
    };
    $say = function ($cmd) use ($fp, $read) { fwrite($fp, $cmd . "\r\n"); return $read(); };

    $banner = $read();
    if (strpos($banner, '220') !== 0) { fclose($fp); return 'unreachable'; }
    $host = $_SERVER['SERVER_NAME'] ?? 'localhost';
    $say('EHLO ' . $host);
    $say('MAIL FROM:<postmaster@' . $host . '>');
    $rcpt = $say('RCPT TO:<' . $email . '>');
    $say('QUIT');
    fclose($fp);

    $code = (int)substr(trim($rcpt), 0, 3);
    if ($code >= 200 && $code < 300) return 'accepted';
    if ($code === 450 || $code === 451 || $code === 452) return 'greylisted';
    if ($code >= 500) return 'rejected';
    return 'unknown';
}

/* ── Third-party verification provider ───────────────────────────────────── */

function dlv_provider_config() {
    $cfg = crm_config();
    return [
        'provider' => $cfg['verify_provider'] ?? '',
        'key'      => $cfg['verify_api_key'] ?? '',
    ];
}

/**
 * Ask a paid verifier when one is configured. Their mailbox-level answer beats
 * anything we can determine from DNS alone, so it overrides the local verdict.
 */
function dlv_provider_verify($email) {
    $p = dlv_provider_config();
    if (!$p['provider'] || !$p['key']) return null;

    $url = null; $parse = null;
    if ($p['provider'] === 'zerobounce') {
        $url = 'https://api.zerobounce.net/v2/validate?api_key=' . urlencode($p['key']) . '&email=' . urlencode($email);
        $parse = function ($j) {
            $s = strtolower($j['status'] ?? '');
            $map = ['valid' => 'valid', 'invalid' => 'invalid', 'catch-all' => 'risky',
                    'unknown' => 'risky', 'spamtrap' => 'invalid', 'abuse' => 'invalid', 'do_not_mail' => 'invalid'];
            return ['verdict' => $map[$s] ?? 'risky', 'raw' => $s, 'sub' => $j['sub_status'] ?? ''];
        };
    } elseif ($p['provider'] === 'kickbox') {
        $url = 'https://api.kickbox.com/v2/verify?email=' . urlencode($email) . '&apikey=' . urlencode($p['key']);
        $parse = function ($j) {
            $s = strtolower($j['result'] ?? '');
            $map = ['deliverable' => 'valid', 'undeliverable' => 'invalid', 'risky' => 'risky', 'unknown' => 'risky'];
            return ['verdict' => $map[$s] ?? 'risky', 'raw' => $s, 'sub' => $j['reason'] ?? ''];
        };
    } else {
        return null;
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12, CURLOPT_SSL_VERIFYPEER => true]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code !== 200 || !$body) return null;
    $j = json_decode($body, true);
    if (!is_array($j)) return null;
    return $parse($j) + ['provider' => $p['provider']];
}

/* ── Routing ─────────────────────────────────────────────────────────────── */

$user = crm_user_from_token($d['token'] ?? '');
if (!$user) out(['success' => false, 'error' => 'Not authenticated.']);

if ($action === 'capabilities') {
    $p = dlv_provider_config();
    out([
        'success' => true,
        'dns'      => dlv_can_dns(),
        'smtp'     => dlv_can_smtp(),
        'provider' => $p['provider'],
        'providerConfigured' => $p['provider'] !== '' && $p['key'] !== '',
        'blacklists' => count(DLV_DNSBL),
    ]);
}

if ($action === 'provider_set') {
    if (($user['role'] ?? '') !== 'agency') out(['success' => false, 'error' => 'Only an agency user can change verification keys.']);
    $prov = $d['provider'] ?? '';
    if (!in_array($prov, ['', 'zerobounce', 'kickbox'], true)) out(['success' => false, 'error' => 'Unknown provider.']);
    $key = trim((string)($d['apiKey'] ?? ''));
    if ($prov !== '' && $key === '') out(['success' => false, 'error' => 'An API key is required for that provider.']);
    if (!crm_config_write(['verify_provider' => $prov, 'verify_api_key' => $key])) {
        out(['success' => false, 'error' => 'Could not write api/config.php. Connect the cloud database first.']);
    }
    out(['success' => true]);
}

if ($action === 'provider_get') {
    $p = dlv_provider_config();
    // The key itself is never returned — only whether one is present.
    out(['success' => true, 'provider' => $p['provider'], 'configured' => $p['key'] !== '']);
}

if ($action === 'auth_check') {
    $domain = dlv_clean_host($d['domain'] ?? '');
    if ($domain === '') out(['success' => false, 'error' => 'That is not a valid domain name.']);
    if (!dlv_can_dns()) {
        out(['success' => false, 'error' => 'This host has DNS lookups disabled, so authentication records cannot be checked from here.']);
    }
    $selectors = $d['selectors'] ?? ['default', 'google', 'selector1', 'selector2', 'k1', 'mail', 's1', 'dkim'];
    if (!is_array($selectors)) $selectors = ['default'];
    $selectors = array_slice($selectors, 0, 12);

    $cacheKey = 'auth:' . $domain . ':' . md5(implode(',', $selectors));
    $cached = dlv_cache_get($cacheKey, 900);
    if ($cached !== null) out(['success' => true, 'cached' => true] + $cached);

    $mx = dlv_mx($domain);
    $payload = [
        'domain' => $domain,
        'spf'    => dlv_spf($domain),
        'dkim'   => dlv_dkim($domain, $selectors),
        'dmarc'  => dlv_dmarc($domain),
        'mx'     => ['status' => $mx ? 'pass' : 'warn', 'records' => $mx,
                     'message' => $mx ? count($mx) . ' mail server(s) published.' : 'No MX records — this domain cannot receive replies or bounce notifications.'],
        'checkedAt' => gmdate('c'),
    ];
    dlv_cache_put($cacheKey, $payload);
    out(['success' => true, 'cached' => false] + $payload);
}

if ($action === 'blacklist') {
    $host = dlv_clean_host($d['host'] ?? '');
    if ($host === '' && !filter_var($d['host'] ?? '', FILTER_VALIDATE_IP)) {
        out(['success' => false, 'error' => 'Enter a domain or IPv4 address.']);
    }
    $target = $host !== '' ? $host : $d['host'];
    $cached = dlv_cache_get('bl:' . $target, 1800);
    if ($cached !== null) out(['success' => true, 'cached' => true] + $cached);
    $res = dlv_blacklist($target);
    dlv_cache_put('bl:' . $target, $res);
    out(['success' => true, 'cached' => false] + $res);
}

if ($action === 'verify') {
    $emails = $d['emails'] ?? [];
    if (!is_array($emails)) out(['success' => false, 'error' => 'emails must be an array.']);
    // Bounded per request so one call cannot tie the host up; the client
    // batches larger lists through its own queue.
    $emails = array_slice($emails, 0, 50);
    $doSmtp = !empty($d['smtp']) && dlv_can_smtp();

    $results = [];
    foreach ($emails as $raw) {
        $norm = dlv_clean_email($raw);
        $ck = 'v:' . md5($norm . ($doSmtp ? ':s' : ''));
        $hit = $norm === '' ? null : dlv_cache_get($ck, 604800);   // a week
        if ($hit !== null) { $hit['cached'] = true; $results[] = $hit; continue; }

        $res = dlv_verify_one($raw, $doSmtp);
        if ($res['syntax'] && $res['hasMx']) {
            $prov = dlv_provider_verify($res['normalized']);
            if ($prov) {
                $res['provider'] = $prov;
                $res['verdict'] = $prov['verdict'];
                $res['score'] = $prov['verdict'] === 'valid' ? 95 : ($prov['verdict'] === 'risky' ? 55 : 5);
                $res['reasons'][] = ucfirst($prov['provider']) . " reported this address as \"{$prov['raw']}\".";
            }
        }
        $res['cached'] = false;
        if ($norm !== '') dlv_cache_put($ck, $res);
        $results[] = $res;
    }
    out(['success' => true, 'results' => $results, 'smtpUsed' => $doSmtp]);
}

out(['success' => false, 'error' => 'Unknown action.']);
