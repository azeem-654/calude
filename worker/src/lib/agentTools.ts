/**
 * The only things a customer-facing AI can actually do.
 *
 * ── Why a fixed list and not database access ──
 *
 * A model with a query interface is a model that will eventually be talked into
 * reading another customer's record. Everything here takes the account id from
 * the *conversation*, never from the model's arguments — so an agent that asks
 * for somebody else's ticket gets its own workspace's answer or nothing.
 *
 * Each tool is also the place a fact gets checked rather than generated.
 * `getAvailableMeetingSlots` is the clearest case: it is the entire reason the
 * model is never told the diary. It cannot offer Tuesday at three unless the
 * booking engine said Tuesday at three.
 *
 * Every tool returns a plain object the widget can render and the next turn can
 * be told about. None of them throw: a tool that fails comes back as a refusal
 * with something the customer can do instead, because the alternative is a chat
 * that goes quiet at the exact moment it offered to help.
 */
import { nowIso, type Env } from './db';
import { guestKey, nextTicketRef, recordEvent, rid, searchKnowledge, upsertPerson } from './engagement';

export interface ToolCall {
  accountId: string;
  conversationId: string;
  personId: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  tool: string;
  ok: boolean;
  /** Shown to the customer, in the chat, as the outcome of what was offered. */
  message: string;
  /** Anything the widget needs to render — slots to pick from, a reference. */
  data?: Record<string, unknown>;
}

const str = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);

export async function runTool(env: Env, call: ToolCall): Promise<ToolResult> {
  try {
    switch (call.name) {
      case 'searchKnowledge': {
        const hits = await searchKnowledge(env, call.accountId, str(call.args.query, 300));
        return {
          tool: call.name, ok: true,
          message: hits.length ? '' : 'I could not find anything on that.',
          data: { articles: hits.map(h => ({ id: h.id, title: h.title })) },
        };
      }

      case 'captureContact': {
        const person = await upsertPerson(env, call.accountId, {
          email: str(call.args.email, 190), name: str(call.args.name, 120),
          phone: str(call.args.phone, 40), source: 'chat', sourceRef: call.conversationId,
        });
        await env.DB.prepare('UPDATE crm_conversations SET person_id = ?, updated_at = ? WHERE id = ? AND account_id = ?')
          .bind(person.id, nowIso(), call.conversationId, call.accountId).run();
        await recordEvent(env, call.accountId, {
          kind: 'contact.captured', personId: person.id, refId: call.conversationId,
          summary: `${person.name || person.email || 'A visitor'} gave their details in the chat`,
        });
        return { tool: call.name, ok: true, message: '', data: { personId: person.id } };
      }

      case 'getAvailableMeetingSlots': {
        /*
         * The whole reason the model is never told the diary.
         *
         * It reads the workspace's own published booking page — the same rows
         * the public booking engine serves — so an offered time is a time that
         * can actually be booked. If nothing is published, it says so rather
         * than inventing office hours.
         */
        const page = await env.DB.prepare(
          'SELECT slug FROM crm_booking_config WHERE account_id = ?',
        ).bind(call.accountId).first<{ slug: string | null }>();

        if (!page?.slug) {
          return {
            tool: call.name, ok: false,
            message: 'We do not have online booking set up yet — I can take your details and have someone call you.',
          };
        }
        return {
          tool: call.name, ok: true,
          message: 'Here are the times you can book.',
          /* The widget opens the real booking page rather than this trying to
             reimplement availability, timezones and conflicts a second time. */
          data: { bookingSlug: page.slug },
        };
      }

      case 'bookMeeting': {
        /* Deliberately not booked from here. Booking needs a slot, a timezone
           and a name, and a model filling those in from a chat is how somebody
           ends up with an appointment they did not agree to. The widget hands
           over to the booking page, which already does this properly. */
        const page = await env.DB.prepare(
          'SELECT slug FROM crm_booking_config WHERE account_id = ?',
        ).bind(call.accountId).first<{ slug: string | null }>();
        return {
          tool: call.name, ok: !!page?.slug,
          message: page?.slug
            ? 'Pick a time that suits you and it is confirmed straight away.'
            : 'We do not have online booking set up yet — I can take your details instead.',
          data: page?.slug ? { bookingSlug: page.slug } : undefined,
        };
      }

      case 'createTicket': {
        const subject = str(call.args.subject, 200) || 'Support request';
        const bodyText = str(call.args.summary ?? call.args.body, 4000);

        let personId = call.personId;
        const email = str(call.args.email, 190);
        if (!personId && email) {
          const p = await upsertPerson(env, call.accountId, { email, source: 'ticket', sourceRef: call.conversationId });
          personId = p.id;
        }

        const reference = await nextTicketRef(env, call.accountId);
        const key = guestKey();
        const id = rid('tkt');
        const now = nowIso();

        await env.DB.prepare(
          `INSERT INTO crm_tickets
           (id, account_id, reference, person_id, conversation_id, subject, body, source, ai_summary, guest_key, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?, 'ai', ?,?,?,?)`,
        ).bind(
          id, call.accountId, reference, personId, call.conversationId,
          subject, bodyText, bodyText.slice(0, 400), key, now, now,
        ).run();

        await recordEvent(env, call.accountId, {
          kind: 'ticket.created', personId, refId: id,
          summary: `${reference}: ${subject} (raised by the assistant)`,
        });

        return {
          tool: call.name, ok: true,
          message: `I have opened ticket ${reference} for you.`,
          data: { reference, guestKey: key },
        };
      }

      case 'handoffToHuman': {
        const summary = str(call.args.summary, 400);
        await env.DB.prepare(
          `UPDATE crm_conversations
           SET handled_by = 'human', status = 'open', ai_summary = ?, updated_at = ?
           WHERE id = ? AND account_id = ?`,
        ).bind(summary, nowIso(), call.conversationId, call.accountId).run();

        /* Written into the transcript, not just the row. A human picking this up
           needs to see where the handover happened and why, in line. */
        await env.DB.prepare(
          `INSERT INTO crm_conversation_messages (id, conversation_id, account_id, role, body, created_at)
           VALUES (?,?,?, 'system', ?, ?)`,
        ).bind(
          rid('msg'), call.conversationId, call.accountId,
          `Handed to a colleague${summary ? `: ${summary}` : ''}`, nowIso(),
        ).run();

        await recordEvent(env, call.accountId, {
          kind: 'conversation.escalated', personId: call.personId, refId: call.conversationId,
          summary: summary || 'The assistant handed over to a person',
        });

        return {
          tool: call.name, ok: true,
          message: 'I have passed this to a colleague — they will pick it up here.',
        };
      }

      default:
        /* A name that is not on the list is not an error worth showing anybody.
           The agent's words have already gone out; the action simply does not. */
        return { tool: call.name, ok: false, message: '' };
    }
  } catch {
    return {
      tool: call.name, ok: false,
      message: 'I could not do that just now. A colleague can pick this up.',
    };
  }
}
