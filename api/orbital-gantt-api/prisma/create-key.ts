import { PrismaClient } from "@prisma/client";
import { randomBytes, createHash } from "node:crypto";

const prisma = new PrismaClient();
const hashKey = (raw: string) => createHash("sha256").update(raw).digest("hex");

async function main() {
  // Reuses your existing organization if one exists (from the original seed),
  // so this doesn't create duplicate demo projects — it just mints a new key.
  let org = await prisma.organization.findFirst();
  if (!org) {
    org = await prisma.organization.create({ data: { name: "Demo Org" } });
    console.log(`No organization existed — created one: ${org.name} (${org.id})`);
  }

  const rawKey = `ogk_${randomBytes(24).toString("hex")}`;
  await prisma.apiKey.create({
    data: {
      organizationId: org.id,
      label: `Key created ${new Date().toISOString()}`,
      keyHash: hashKey(rawKey),
    },
  });

  console.log(`\nNew API key for "${org.name}" (save this now, it won't be shown again):\n`);
  console.log(`  ${rawKey}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
