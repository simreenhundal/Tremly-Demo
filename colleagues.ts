import type { Person } from "./types";

/**
 * The demo is pinned to one real week so holidays are genuine.
 * Mon 3 May 2027 is the UK Early May bank holiday.
 */
export const DEMO_WEEK_START = "2027-05-03"; // Monday

export const COLLEAGUES: Person[] = [
  {
    id: "charlie",
    name: "Charlie",
    city: "London",
    timezone: "Europe/London",
    workDays: [1, 2, 3, 4, 5],
    workingHours: { start: "09:00", end: "17:30" },
    ledger: { earlyCalls: 0, lateCalls: 1 },
    constraints: [
      {
        id: "charlie-bank-holiday",
        kind: "holiday",
        date: "2027-05-03",
        label: "UK bank holiday (Early May)",
        publicLabel: "UK bank holiday",
        visibility: "detail",
      },
      {
        id: "charlie-pickup",
        kind: "recurring_block",
        days: [2, 4],
        start: "15:15",
        end: "16:00",
        label: "School pickup",
        publicLabel: "Family commitment",
        visibility: "private", // Charlie keeps this private: teammates just see "Busy"
      },
    ],
  },
  {
    id: "amina",
    name: "Amina",
    city: "Amman",
    timezone: "Asia/Amman",
    workDays: [0, 1, 2, 3, 4], // Jordan's weekend is Friday–Saturday
    workingHours: { start: "09:00", end: "17:00" },
    ledger: { earlyCalls: 0, lateCalls: 1 },
    constraints: [
      // Amina is Muslim. Prayer times shift with the sun; these are approximate for Amman in early May.
      // She has chosen to share them, so teammates see the prayer by name.
      {
        id: "amina-dhuhr",
        kind: "recurring_block",
        days: [0, 1, 2, 3, 4],
        start: "12:30",
        end: "13:00",
        label: "Midday prayer (Dhuhr)",
        publicLabel: "Prayer time",
        visibility: "detail",
      },
      {
        id: "amina-asr",
        kind: "recurring_block",
        days: [0, 1, 2, 3, 4],
        start: "16:15",
        end: "16:45",
        label: "Afternoon prayer (Asr)",
        publicLabel: "Prayer time",
        visibility: "detail",
      },
    ],
  },
  {
    id: "arjun",
    name: "Arjun",
    city: "Bengaluru",
    timezone: "Asia/Kolkata",
    workDays: [1, 2, 3, 4, 5],
    workingHours: { start: "10:00", end: "18:00" },
    ledger: { earlyCalls: 0, lateCalls: 4 },
    constraints: [
      {
        id: "arjun-hard-stop",
        kind: "hard_stop",
        start: "19:00",
        label: "Hard stop at 7pm for family dinner",
        publicLabel: "Hard stop at 7pm IST",
        visibility: "category",
      },
    ],
  },
];

/** Used when the viewer skips onboarding. */
export const SAMPLE_VIEWER: Person = {
  id: "viewer",
  name: "You",
  city: "Toronto",
  timezone: "America/Toronto",
  workDays: [1, 2, 3, 4, 5],
  workingHours: { start: "09:00", end: "17:00" },
  ledger: { earlyCalls: 0, lateCalls: 0 },
  constraints: [],
  isViewer: true,
};
