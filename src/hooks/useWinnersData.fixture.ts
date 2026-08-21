// Synthetic winners dataset for unit tests. Hand-built so each accuracy rule
// (leave-one-out baselines, maturity weighting, shrinkage, role-vs-type filter,
// Kenny exclusion, full-coverage -> unmeasurable) has a deterministic trigger.
// All doneDates are >120d in the past so maturity weight = 1 and expected
// values are exact and easy to reason about.

type Role = { id: string; name: string; publicId: string };
const CW: Role = { id: "role-cw", name: "Copywriter (CW)", publicId: "11" };
const VE: Role = { id: "role-ve", name: "Video Editor (VE)", publicId: "1" };
const GD: Role = { id: "role-gd", name: "Graphic Designer (GD)", publicId: "6" };
const CD: Role = { id: "role-cd", name: "Creative Director (CD)", publicId: "9" };

let seq = 0;
interface Person { id: string; name: string }
interface Assign { person: Person; role: Role; external?: boolean }

function project(
  clientId: string,
  clientName: string,
  typeName: string,
  winner: boolean,
  assigns: Assign[],
  // Overrides the default fully-matured September date. Only the trend fixture
  // uses it — the accuracy fixture deliberately keeps every row on one date so
  // maturity weights stay at exactly 1.
  doneISO?: string,
) {
  seq += 1;
  const internal = assigns.filter((a) => !a.external);
  const external = assigns.filter((a) => a.external);
  return {
    id: `p${seq}`,
    name: `Proj ${seq}`,
    creationDate: doneISO ?? "2025-09-10T00:00:00.000Z",
    doneDate: doneISO ?? "2025-09-20T00:00:00.000Z", // default is fully mature
    status: { name: "Completed" },
    client: { id: clientId, name: clientName },
    type: { name: typeName },
    projectRolesInternal: internal.map((a) => ({
      assignee: { id: a.person.id, name: a.person.name },
      role: a.role,
    })),
    projectContractorsExternal: external.map((a, i) => ({
      id: `pc-${seq}-${i}`,
      contractor: { id: a.person.id, name: a.person.name },
      role: a.role,
    })),
    internalVersions: [
      {
        id: `v${seq}`,
        name: `v${seq}`,
        winnerDate: winner ? (doneISO ?? "2025-11-01T00:00:00.000Z") : null,
        tags: winner ? [{ id: `t${seq}`, name: `Winner - ${clientName}` }] : [],
      },
    ],
  };
}

const star: Person = { id: "u-star", name: "Star Writer" };
const avg: Person = { id: "u-avg", name: "Avg Writer" };
const vedA: Person = { id: "u-veda", name: "Ved Editor" };
const vedB: Person = { id: "u-vedb", name: "Vee Editor" };
const boss: Person = { id: "u-boss", name: "Boss Director" };
const kenny: Person = { id: "u-kenny", name: "Kenny Fisher" };
const erik: Person = { id: "u-erik", name: "Erik Furtado" };

export function buildFixtureProjects() {
  seq = 0;
  const rows: ReturnType<typeof project>[] = [];
  const A = "cA";

  // Alpha: 10 video projects with Star (CW) + Ved (VE); Star wins 5.
  for (let i = 0; i < 10; i++) {
    rows.push(
      project(A, "Alpha", "VIDEO - LoFi", i < 5, [
        { person: star, role: CW },
        { person: vedA, role: VE },
        { person: boss, role: CD },
      ])
    );
  }
  // Alpha: 10 video projects with Avg (CW) + Vee (VE); Avg wins 1.
  for (let i = 0; i < 10; i++) {
    rows.push(
      project(A, "Alpha", "VIDEO - LoFi", i < 1, [
        { person: avg, role: CW },
        { person: vedB, role: VE },
        { person: boss, role: CD },
      ])
    );
  }
  // A video project where Kenny is layered on as an EXTERNAL VE next to the
  // real editor -> Kenny must be excluded entirely (phantom contributor).
  rows.push(
    project(A, "Alpha", "VIDEO - LoFi", true, [
      { person: avg, role: CW },
      { person: vedB, role: VE },
      { person: kenny, role: VE, external: true },
      { person: boss, role: CD },
    ])
  );
  // A STATIC project where Erik is (wrongly) credited as VE -> role/type
  // mismatch, must be dropped so no Erik-VE row appears.
  rows.push(
    project(A, "Alpha", "STATIC", false, [
      { person: erik, role: VE, external: true },
      { person: boss, role: CD },
    ])
  );

  return rows;
}

// ---------------------------------------------------------------------------
// Trend fixture — projects spread across months so the rolling-window W Index
// has something to trend. Pin the clock to 2026-06-15 when using it.
//
// Alpha has two copywriters. Peer writes 10 projects a month Sep '25-Mar '26 and
// wins exactly 1 each month, so Trend's leave-one-out baseline is exactly 10%.
// Trend writes 10 a month over the same span, winning 3 a month for the first
// three months and 0 after -> a clean fall from an index of 300 to 0. Trend also
// has 6 projects finished five days before the pinned clock, which is what the
// maturity gate has to keep out of the published windows.
export const TREND_FIXTURE_NOW = "2026-06-15T12:00:00.000Z";
const trendWriter: Person = { id: "u-trend", name: "Trend Writer" };
const peerWriter: Person = { id: "u-peer", name: "Peer Writer" };
const soloWriter: Person = { id: "u-solo", name: "Solo Writer" };

const MONTHS = [
  "2025-09-10", "2025-10-10", "2025-11-10", "2025-12-10",
  "2026-01-10", "2026-02-10", "2026-03-10",
];

export function buildTrendFixtureProjects() {
  seq = 0;
  const rows: ReturnType<typeof project>[] = [];
  const A = "cA";
  MONTHS.forEach((day, mi) => {
    const iso = `${day}T00:00:00.000Z`;
    const trendWins = mi < 3 ? 3 : 0;
    for (let i = 0; i < 10; i++) {
      rows.push(project(A, "Alpha", "VIDEO - LoFi", i < trendWins, [{ person: trendWriter, role: CW }], iso));
      rows.push(project(A, "Alpha", "VIDEO - LoFi", i < 1, [{ person: peerWriter, role: CW }], iso));
    }
  });
  // Finished five days before the pinned clock -> maturity ~0.14, so the window
  // holding them must not be published yet.
  for (let i = 0; i < 6; i++) {
    rows.push(project(A, "Alpha", "VIDEO - LoFi", false, [{ person: trendWriter, role: CW }], "2026-06-10T00:00:00.000Z"));
  }
  // Sole contributor on their own client -> no independent baseline, so no
  // headline index and no trend either.
  for (let i = 0; i < 12; i++) {
    rows.push(project("cB", "Beta", "VIDEO - LoFi", i < 2, [{ person: soloWriter, role: CW }], MONTHS[i % MONTHS.length] + "T00:00:00.000Z"));
  }
  return rows;
}

export const TREND_FIXTURE_NAMES = {
  trend: trendWriter.name,
  peer: peerWriter.name,
  solo: soloWriter.name,
};

export const FIXTURE_NAMES = {
  star: star.name,
  avg: avg.name,
  boss: boss.name,
  kenny: kenny.name,
  erik: erik.name,
  vedA: vedA.name,
  vedB: vedB.name,
};
