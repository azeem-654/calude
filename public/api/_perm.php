<?php
/**
 * _perm.php — server-side permission enforcement for contact data.
 *
 * The browser decides what buttons to show; this file decides what actually
 * gets written. Because every path to the server store goes through
 * data.php, guarding writes here makes the permission model real rather than
 * cosmetic — a user with devtools can change the UI, but cannot change what
 * the database accepts.
 *
 * The frontend keeps contacts as one JSON array under the key `crm_contacts`.
 * Rather than migrate that to rows, the guard diffs an incoming array against
 * the stored one and rejects the write if it touches a record the actor may
 * not touch. Same rules as src/services/contactPermissions.ts, enforced where
 * it counts.
 */

/** Capabilities each role has before ownership is considered. */
function crm_role_caps($role) {
    $caps = [
        'agency' => ['view', 'edit', 'delete', 'export', 'reassign', 'merge', 'bulk_edit', 'manage_lists'],
        'client' => ['view', 'edit', 'delete', 'export', 'reassign', 'bulk_edit', 'manage_lists'],
    ];
    return $caps[$role] ?? ['view'];
}

/** Capabilities that additionally require owning the record. */
function crm_owner_only_caps() {
    return ['edit', 'delete', 'reassign', 'merge'];
}

function crm_owner_of($contact) {
    return trim((string)($contact['assignedTo'] ?? ''));
}

/** Unowned records are everyone's; otherwise match on email or display name. */
function crm_is_owner($contact, $user) {
    $owner = strtolower(crm_owner_of($contact));
    if ($owner === '') return true;
    $email = strtolower((string)($user['email'] ?? ''));
    $name  = strtolower((string)($user['name'] ?? ''));
    return $owner === $email || ($name !== '' && $owner === $name);
}

function crm_can($cap, $user, $contact = null) {
    if (!$user) return false;
    $role = $user['role'] ?? 'client';
    if (!in_array($cap, crm_role_caps($role), true)) return false;
    if ($role === 'agency') return true;
    if ($contact !== null && in_array($cap, crm_owner_only_caps(), true)) return crm_is_owner($contact, $user);
    return true;
}

/** The matrix the UI asks for, so both sides agree on the same rules. */
function crm_capability_matrix($user) {
    $role = $user['role'] ?? 'client';
    $all  = ['view', 'edit', 'delete', 'export', 'reassign', 'merge', 'bulk_edit', 'manage_lists'];
    $out  = [];
    foreach ($all as $cap) {
        $out[$cap] = in_array($cap, crm_role_caps($role), true);
    }
    return [
        'role'        => $role,
        'email'       => $user['email'] ?? '',
        'name'        => $user['name'] ?? '',
        'capabilities'=> $out,
        'ownerOnly'   => crm_owner_only_caps(),
        'enforced'    => true,
    ];
}

/* ── Guarded keys ── */

/** Keys whose contents carry per-record ownership and must be diffed. */
function crm_guarded_keys() {
    return ['crm_contacts'];
}

/**
 * Keys a non-agency user must never be able to remove outright. Editing them
 * is normal work; deleting the whole key is not, and would destroy records
 * belonging to the rest of the team in one request.
 */
function crm_undeletable_keys() {
    return [
        'crm_contacts', 'crm_pipelines', 'crm_appointments', 'crm_bookings',
        'crm_contact_emails', 'crm_contact_lists', 'crm_sequences', 'crm_campaigns',
    ];
}

function crm_read_key($pdo, $accountId, $key) {
    try {
        $stmt = $pdo->prepare('SELECT v FROM crm_data WHERE account_id = ? AND k = ?');
        $stmt->execute([$accountId, $key]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ? $row['v'] : null;
    } catch (Throwable $e) { return null; }
}

function crm_index_by_id($rows) {
    $out = [];
    foreach ((array)$rows as $r) {
        if (is_array($r) && isset($r['id'])) $out[(string)$r['id']] = $r;
    }
    return $out;
}

/**
 * Compare two contact records for a meaningful change. Encoding both sides
 * canonically avoids false positives from key ordering.
 */
function crm_same_record($a, $b) {
    return json_encode(crm_sorted($a)) === json_encode(crm_sorted($b));
}

function crm_sorted($v) {
    if (!is_array($v)) return $v;
    $isList = array_keys($v) === range(0, count($v) - 1);
    if ($isList) return array_map('crm_sorted', $v);
    ksort($v);
    foreach ($v as $k => $x) $v[$k] = crm_sorted($x);
    return $v;
}

/**
 * Decide whether a write to a guarded key may proceed.
 *
 * Returns ['ok' => bool, 'error' => string, 'value' => string]. On success the
 * returned value may differ from the input: new records created by a
 * non-agency user are stamped with that user as the owner, so a client cannot
 * create records that nobody is accountable for.
 */
function crm_guard_write($pdo, $user, $accountId, $key, $value) {
    $isAgency = ($user['role'] ?? '') === 'agency';

    // Wholesale removal of a core data key is refused for everyone but agency,
    // whichever key it is — a single request should not be able to empty the
    // workspace for the rest of the team.
    if ($value === null && !$isAgency && in_array($key, crm_undeletable_keys(), true)) {
        return ['ok' => false, 'error' => 'Your role cannot clear the whole ' . str_replace('crm_', '', $key) . ' database.', 'value' => null];
    }

    if (!in_array($key, crm_guarded_keys(), true)) return ['ok' => true, 'value' => $value];
    if ($isAgency)                                 return ['ok' => true, 'value' => $value];

    if ($value === null) {
        return ['ok' => false, 'error' => 'Your role cannot clear the whole contact database.', 'value' => null];
    }

    $incoming = json_decode((string)$value, true);
    if (!is_array($incoming)) {
        return ['ok' => false, 'error' => 'Contacts must be a JSON array.', 'value' => $value];
    }

    $storedRaw = crm_read_key($pdo, $accountId, $key);
    $stored    = $storedRaw === null ? [] : (json_decode($storedRaw, true) ?: []);

    $before = crm_index_by_id($stored);
    $after  = crm_index_by_id($incoming);

    // Removals: only records the actor owns may disappear.
    foreach ($before as $id => $old) {
        if (isset($after[$id])) continue;
        if (!crm_can('delete', $user, $old)) {
            $owner = crm_owner_of($old) ?: 'another user';
            return ['ok' => false, 'error' => "Blocked: \"{$old['name']}\" is owned by {$owner} and cannot be deleted by you.", 'value' => $storedRaw];
        }
    }

    // Modifications: only records the actor owns may change, and reassigning
    // ownership away needs the reassign capability on the record as it stands.
    foreach ($after as $id => $new) {
        if (!isset($before[$id])) continue;
        $old = $before[$id];
        if (crm_same_record($old, $new)) continue;
        if (!crm_can('edit', $user, $old)) {
            $owner = crm_owner_of($old) ?: 'another user';
            return ['ok' => false, 'error' => "Blocked: \"{$old['name']}\" is owned by {$owner} and cannot be edited by you.", 'value' => $storedRaw];
        }
        if (crm_owner_of($old) !== crm_owner_of($new) && !crm_can('reassign', $user, $old)) {
            return ['ok' => false, 'error' => "Blocked: you cannot change who owns \"{$old['name']}\".", 'value' => $storedRaw];
        }
    }

    // Creations: stamp the actor as owner when none was set, so every record a
    // non-agency user adds has someone accountable for it.
    $changed = false;
    foreach ($incoming as $i => $row) {
        if (!is_array($row) || !isset($row['id'])) continue;
        if (isset($before[(string)$row['id']])) continue;
        if (crm_owner_of($row) === '') {
            $incoming[$i]['assignedTo'] = $user['email'] ?? '';
            $changed = true;
        }
    }

    return ['ok' => true, 'value' => $changed ? json_encode($incoming) : $value];
}
