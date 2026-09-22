import type { Constraint, EvaluatedSlot, Finding, Person, ScheduleResult } from "./types";
import { DAY_NAMES, addDays, formatInZone, localParts, toMinutes, zonedToUtc } from "./time";

const STRETCH_LIMIT = 60; // minutes outside working hours tolerated as a strain, not a conflict
const STEP = 30;

function shownLabel(c: Constraint, owner: Person): string {
  if (owner.isViewer || c.visibility === "detail") return c.label;
  if (c.visibility === "category") return c.publicLabel;
  return "Busy";
}

const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

/** Rules layer: deterministic checks for one person against one slot. */
export function evaluatePerson(p: Person, startUtc: number, endUtc: number) {
  const conflicts: Finding[] = [];
  const strains: Finding[] = [];
  const add = (severity: "conflict" | "strain", text: string, source: "calendar" | "context" = "context") =>
    (severity === "conflict" ? conflicts : strains).push({ personId: p.id, personName: p.name, severity, text, source });

  const s = localParts(startUtc, p.timezone);
  const e = localParts(endUtc - 60_000, p.timezone);
  const endMin = e.minutes + 1 === 1440 ? 1440 : e.minutes + 1;
  const sameDay = s.date === e.date;
  const ws = toMinutes(p.workingHours.start);
  const we = toMinutes(p.workingHours.end);

  if (!p.workDays.includes(s.weekday)) add("conflict", `${DAY_NAMES[s.weekday]} is outside ${p.name}'s workweek`, "calendar");

  for (const c of p.constraints) {
    const label = shownLabel(c, p);
    const dayOk = (!c.days || c.days.includes(s.weekday)) && (!c.date || c.kind === "holiday" || c.date === s.date);
    if (c.kind === "holiday" && (c.date === s.date || c.date === e.date)) add("conflict", label);
    if (c.kind === "recurring_block" && sameDay && dayOk && c.start && c.end &&
        overlaps(s.minutes, endMin, toMinutes(c.start), toMinutes(c.end))) add("conflict", label);
    if (c.kind === "hard_stop" && dayOk && c.start && (!sameDay || endMin > toMinutes(c.start))) add("conflict", label);
    if (c.kind === "preference" && sameDay && dayOk && c.start && c.end &&
        overlaps(s.minutes, endMin, toMinutes(c.start), toMinutes(c.end))) add("strain", label);
  }

  const outside = sameDay ? Math.max(0, ws - s.minutes) + Math.max(0, endMin - we) : Infinity;
  if (outside > STRETCH_LIMIT) add("conflict", `Outside ${p.name}'s working hours`, "calendar");
  else if (outside > 0) add("strain", `Runs ${outside} min outside ${p.name}'s working hours`, "calendar");

  // Fairness cost: sitting at the edge of someone's day costs more if they've already absorbed it this month.
  const early = sameDay && s.minutes < ws + 60;
  const late = sameDay && endMin > we - 60;
  const cost =
    strains.length * 3 +
    (early ? 2 * (1 + 0.5 * p.ledger.earlyCalls) : 0) +
    (late ? 2 * (1 + 0.5 * p.ledger.lateCalls) : 0);

  return { conflicts, strains, cost };
}

export function evaluateSlot(people: Person[], startUtc: number, durationMin: number): EvaluatedSlot {
  const endUtc = startUtc + durationMin * 60_000;
  const slot: EvaluatedSlot = { startUtc, endUtc, conflicts: [], strains: [], costs: {}, worstCost: 0, totalCost: 0 };
  for (const p of people) {
    const r = evaluatePerson(p, startUtc, endUtc);
    slot.conflicts.push(...r.conflicts);
    slot.strains.push(...r.strains);
    slot.costs[p.id] = r.cost;
    slot.worstCost = Math.max(slot.worstCost, r.cost);
    slot.totalCost += r.cost;
  }
  return slot;
}

/** Leximin-style: fewest conflicts, then protect the worst-off person, then total burden, then earliest. */
const affected = (s: EvaluatedSlot) => new Set(s.conflicts.map((f) => f.personId)).size;
const compare = (a: EvaluatedSlot, b: EvaluatedSlot) =>
  affected(a) - affected(b) ||
  a.conflicts.length - b.conflicts.length ||
  a.worstCost - b.worstCost ||
  a.totalCost - b.totalCost ||
  a.startUtc - b.startUtc;

export function schedule(opts: {
  organizer: Person;
  attendees: Person[];
  durationMin?: number;
  weekStart: string; // organizer-local Monday, YYYY-MM-DD
  days?: number;
}): ScheduleResult {
  const { organizer, attendees, weekStart } = opts;
  const durationMin = opts.durationMin ?? 30;
  const days = opts.days ?? 5;
  const people = [organizer, ...attendees];
  const tz = organizer.timezone;

  // Candidate slots: organizer's working hours plus a stretch hour either side, every 30 min.
  // The organizer can take the stretch too; sometimes that's the fairest answer.
  const slots: EvaluatedSlot[] = [];
  const ws = toMinutes(organizer.workingHours.start);
  const we = toMinutes(organizer.workingHours.end);
  const from = Math.max(0, ws - STRETCH_LIMIT);
  const to = Math.min(1440, we + STRETCH_LIMIT);
  for (let d = 0; d < days; d++) {
    const date = addDays(weekStart, d);
    for (let m = from; m + durationMin <= to; m += STEP) {
      slots.push(evaluateSlot(people, zonedToUtc(date, m, tz), durationMin));
    }
  }

  // What a plain calendar books: first slot inside the organizer's hours with no conflict a calendar can see.
  // Its only problems are the ones only Tremly knows about.
  const inOrganizerHours = (s: EvaluatedSlot) => {
    const m = localParts(s.startUtc, tz).minutes;
    return m >= ws && m + durationMin <= we;
  };
  const naive =
    slots.find((s) => inOrganizerHours(s) && !s.conflicts.some((f) => f.source === "calendar")) ??
    slots.find(inOrganizerHours) ??
    slots[0];

  // Best slot per day, so alternatives are genuinely different options.
  const bestByDay = new Map<string, EvaluatedSlot>();
  for (const s of slots) {
    const key = localParts(s.startUtc, tz).date;
    const cur = bestByDay.get(key);
    if (!cur || compare(s, cur) < 0) bestByDay.set(key, s);
  }
  const ranked = [...bestByDay.values()].sort(compare);
  const clean = ranked.filter((s) => s.conflicts.length === 0);
  const noCleanSlot = clean.length === 0;
  const recommendations = (noCleanSlot ? ranked : clean).slice(0, 3);
  const ruledOut = slots.filter((s) => s.conflicts.length > 0).length;

  return {
    naive,
    recommendations,
    considered: slots.length,
    ruledOut,
    noCleanSlot,
    trace: buildTrace({ people, organizer, naive, recommendations, considered: slots.length, ruledOut, days, noCleanSlot }),
  };
}

function buildTrace(x: {
  people: Person[]; organizer: Person; naive: EvaluatedSlot; recommendations: EvaluatedSlot[];
  considered: number; ruledOut: number; days: number; noCleanSlot: boolean;
}): string[] {
  const tz = x.organizer.timezone;
  const zones = new Set(x.people.map((p) => p.timezone)).size;
  const lines: string[] = [];

  const naiveVisible = x.naive.conflicts.some((f) => f.source === "calendar");
  lines.push(
    naiveVisible
      ? `Your calendar's first open slot is ${formatInZone(x.naive.startUtc, tz)}.`
      : `Calendars show everyone free at ${formatInZone(x.naive.startUtc, tz)}.`,
  );
  if (x.naive.conflicts.length) {
    for (const f of x.naive.conflicts) lines.push(`But ${f.personName}: ${f.text}.`);
  } else {
    lines.push("No hard conflicts. Checking it's fair.");
  }
  lines.push(`Checked ${x.considered} times across ${zones} time zones. ${x.ruledOut} clash with someone's real week.`);

  for (const p of x.people) {
    if (p.ledger.lateCalls >= 3) lines.push(`${p.name} has taken ${p.ledger.lateCalls} late calls this month, so late times count extra for ${p.name}.`);
    if (p.ledger.earlyCalls >= 3) lines.push(`${p.name} has taken ${p.ledger.earlyCalls} early calls this month, so early times count extra for ${p.name}.`);
  }

  const best = x.recommendations[0];
  if (!best) return lines;
  if (x.noCleanSlot) {
    const who = [...new Set(best.conflicts.map((f) => f.personName))];
    lines.push("No time this week works for everyone.");
    lines.push(`Least disruptive: ${formatInZone(best.startUtc, tz)}, but it still affects ${joinNames(who)}. An async update may work better.`);
  } else {
    lines.push(`Recommending ${formatInZone(best.startUtc, tz)}. ${explainBest(best, x.people)}.`);
  }
  return lines;
}

const joinNames = (n: string[]) => (n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`);

/** One short, plain sentence on why this slot won. */
function explainBest(slot: EvaluatedSlot, people: Person[]): string {
  if (slot.worstCost === 0) return "It sits comfortably inside everyone's day";
  const clauses: string[] = [];
  for (const p of people) {
    if (!slot.strains.some((f) => f.personId === p.id)) continue;
    const start = localParts(slot.startUtc, p.timezone).minutes;
    const edge = start < toMinutes(p.workingHours.start) ? "an early start" : "a late finish";
    const pref = slot.strains.find((f) => f.personId === p.id && !f.text.startsWith("Runs "));
    clauses.push(`${p.isViewer ? "You take" : `${p.name} takes`} ${edge} this time${pref ? ` (it cuts into "${pref.text}")` : ""}`);
  }
  const protectedPeople = people.filter(
    (p) => (p.ledger.lateCalls >= 3 || p.ledger.earlyCalls >= 3) && !slot.strains.some((f) => f.personId === p.id),
  );
  let why = clauses.length ? clauses.join(", and ") : "Everyone stays inside working hours";
  if (protectedPeople.length) {
    const p = protectedPeople[0];
    why += `, so ${p.name} isn't pushed ${p.ledger.lateCalls >= 3 ? "late" : "early"} again`;
  }
  return why;
}
