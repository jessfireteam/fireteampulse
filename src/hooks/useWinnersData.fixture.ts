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
) {
  seq += 1;
  const internal = assigns.filter((a) => !a.external);
  const external = assigns.filter((a) => a.external);
  return {
    id: `p${seq}`,
    name: `Proj ${seq}`,
    creationDate: "2025-09-10T00:00:00.000Z",
    doneDate: "2025-09-20T00:00:00.000Z", // ~10 months old -> fully mature
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
        winnerDate: winner ? "2025-11-01T00:00:00.000Z" : null,
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

export const FIXTURE_NAMES = {
  star: star.name,
  avg: avg.name,
  boss: boss.name,
  kenny: kenny.name,
  erik: erik.name,
  vedA: vedA.name,
  vedB: vedB.name,
};
