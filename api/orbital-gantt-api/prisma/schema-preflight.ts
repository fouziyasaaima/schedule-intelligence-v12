import { PrismaClient } from "@prisma/client";

/**
 * Compatibility preflight for databases created by older SI releases.
 *
 * v20 requires tasks.project_id. Some older databases were created before the
 * task/project relationship was hardened and can therefore be missing the
 * snake_case column. We repair only the known compatibility case and never
 * delete or recreate the database.
 */
const prisma = new PrismaClient();

async function tableExists(table: string) {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

async function columnExists(table: string, column: string) {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${table}
        AND column_name = ${column}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

async function main() {
  if (!(await tableExists("tasks"))) {
    console.log("Schema preflight: tasks table does not exist yet; Prisma db push will create it.");
    return;
  }

  if (await columnExists("tasks", "project_id")) {
    console.log("Schema preflight: tasks.project_id is present.");
    return;
  }

  console.warn("Schema preflight: tasks.project_id is missing; checking legacy compatibility columns.");

  // Older experimental builds sometimes used camelCase SQL identifiers.
  if (await columnExists("tasks", "projectId")) {
    console.log("Schema preflight: migrating legacy tasks.projectId -> tasks.project_id.");
    await prisma.$executeRawUnsafe(`ALTER TABLE "tasks" ADD COLUMN "project_id" TEXT`);
    await prisma.$executeRawUnsafe(`UPDATE "tasks" SET "project_id" = "projectId" WHERE "project_id" IS NULL`);
    return;
  }

  // If there is exactly one project, assigning existing orphan tasks to that
  // project is deterministic and preserves the existing schedule. If there are
  // multiple projects we refuse to guess, because that could corrupt tenant data.
  if (await tableExists("projects")) {
    const projects = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "projects" ORDER BY created_at ASC, id ASC
    `;

    if (projects.length === 1) {
      const projectId = projects[0].id;
      console.log(`Schema preflight: adding tasks.project_id and assigning existing tasks to the only project ${projectId}.`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "tasks" ADD COLUMN "project_id" TEXT`);
      await prisma.$executeRawUnsafe(`UPDATE "tasks" SET "project_id" = $1 WHERE "project_id" IS NULL`, projectId);
      return;
    }

    throw new Error(
      `Schema preflight failed: tasks.project_id is missing and the database contains ${projects.length} projects. ` +
      `SI will not guess which project owns existing tasks. Restore the correct task/project mapping before startup.`
    );
  }

  throw new Error("Schema preflight failed: tasks.project_id is missing and the projects table is unavailable.");
}

main()
  .catch((error) => {
    console.error("== Schema preflight FAILED ==");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
