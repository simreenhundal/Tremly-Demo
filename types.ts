export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export type ConstraintKind =
  | "holiday"          // dated, all day (statutory or declared leave)
  | "recurring_block"  // fixed commitment at a set time (pickup, prayer, class)
  | "hard_stop"        // must be finished by a time
  | "preference";      // soft wish, e.g. "avoid before 10:00"

/** What teammates see: "detail" = the label, "category" = publicLabel, "private" = just "Busy". */
export type Visibility = "detail" | "category" | "private";

export interface Constraint {
  id: string;
  kind: ConstraintKind;
  label: string;        // full detail, what the owner sees
  publicLabel: string;  // what colleagues see when visibility = "category"
  visibility: Visibility;
  days?: Weekday[];     // omitted = every day
  date?: string;        // YYYY-MM-DD local: a holiday, or a one-off block (e.g. an already-booked meeting)
  start?: string;       // "HH:MM" local
  end?: string;         // "HH:MM" local
}

export interface Person {
  id: string;
  name: string;
  city: string;
  timezone: string;     // IANA, e.g. "Europe/London"
  workDays: Weekday[];
  workingHours: { start: string; end: string };
  constraints: Constraint[];
  /** Equity ledger: inconvenience already absorbed this month. */
  ledger: { earlyCalls: number; lateCalls: number };
  isViewer?: boolean;
}

export type Severity = "conflict" | "strain";

export interface Finding {
  personId: string;
  personName: string;
  severity: Severity;
  text: string;         // already filtered through visibility
  /** "calendar" = a normal calendar can see it (working hours/days); "context" = only Tremly knows. */
  source: "calendar" | "context";
}

export interface EvaluatedSlot {
  startUtc: number;
  endUtc: number;
  conflicts: Finding[];
  strains: Finding[];
  costs: Record<string, number>;
  worstCost: number;
  totalCost: number;
}

export interface ScheduleResult {
  naive: EvaluatedSlot;              // what a plain calendar would book
  recommendations: EvaluatedSlot[];  // best first, max 3, different days
  considered: number;
  ruledOut: number;
  noCleanSlot: boolean;              // true if no time clears everyone's hard constraints
  trace: string[];                   // agent reasoning lines to stream in the UI
}
