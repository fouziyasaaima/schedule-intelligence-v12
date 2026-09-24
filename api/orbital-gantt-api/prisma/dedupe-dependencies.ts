import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Keeps the oldest relationship for each predecessor -> successor pair.
 * PRMS treats relationship type and lag/lead as editable properties of one edge,
 * so duplicate edges between the same task pair must never survive schema hardening.
 *
 * This script is intentionally safe on a fresh database: Prisma db push has not
 * created the dependencies table yet, so there is nothing to normalize.
 */
async function main() {
  const table = await prisma.$queryRaw<Array<{ regclass: string | null }>>`
    SELECT to_regclass('"dependencies"')::text AS regclass
  `;

  if (!table[0]?.regclass) {
    console.log("Dependency pair normalization skipped: dependencies table does not exist yet.");
    return;
  }

  const deleted = await prisma.$executeRawUnsafe(`
    DELETE FROM "dependencies" d
    USING (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY "project_id", "predecessor_task_id", "successor_task_id"
        ORDER BY "created_at" ASC, id ASC
      ) AS rn
      FROM "dependencies"
    ) ranked
    WHERE d.id = ranked.id AND ranked.rn > 1
  `);

  console.log(`Dependency pair normalization removed ${deleted} duplicate relationship(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
