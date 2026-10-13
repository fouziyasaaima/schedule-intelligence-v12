import { PrismaClient } from "@prisma/client";

/**
 * Repairs stale/corrupt PostgreSQL planner statistics without touching user
 * rows. PostgreSQL's pg_statistic uses TOAST (commonly pg_toast_2619 on
 * PostgreSQL 16). A damaged statistics TOAST value can make an otherwise
 * healthy Prisma SELECT fail with SQLSTATE XX001 / "missing chunk number".
 *
 * ANALYZE rebuilds statistics from the real tables and is safe to repeat.
 * We deliberately do not truncate/delete pg_statistic or user data.
 */
const prisma = new PrismaClient();

const tables = [
  "projects",
  "tasks",
  "dependencies",
  "resources",
  "project_resources",
  "assignments",
  "schedule_results",
  "insights",
  "connectors",
  "connector_mappings",
  "connector_identities",
];

async function tableExists(table: string) {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

async function main() {
  console.log("== PostgreSQL statistics preflight ==");
  for (const table of tables) {
    if (!(await tableExists(table))) continue;
    try {
      // ANALYZE replaces planner statistics, including TOAST-backed values in
      // pg_statistic. It does not modify application table data.
      await prisma.$executeRawUnsafe(`ANALYZE "${table}"`);
      console.log(`Statistics preflight: analyzed ${table}.`);
    } catch (error) {
      // Do not prevent SI from starting merely because a non-critical table is
      // unavailable during bootstrap. The main API will surface a real query
      // failure if the table itself remains damaged.
      console.warn(
        `Statistics preflight: could not analyze ${table}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}

main()
  .catch((error) => {
    console.error("== Statistics preflight failed ==");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
