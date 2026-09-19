import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes, scrypt as _scrypt } from "node:crypto";
import { promisify } from "node:util";

const prisma = new PrismaClient();
const DAY_MS = 86_400_000;
const scrypt = promisify(_scrypt);
const hashKey = (raw: string) => createHash("sha256").update(raw).digest("hex");
async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function main() {
  const orgId = process.env.SEED_ORG_ID || "demo-org";
  const org = await prisma.organization.upsert({ where: { id: orgId }, update: {}, create: { id: orgId, name: "Demo Organization" } });
  const demoEmail = (process.env.SEED_USER_EMAIL || "demo@example.com").toLowerCase();
  const demoPassword = process.env.SEED_USER_PASSWORD || "ChangeMe123!ChangeMe";
  if (demoPassword.length < 12) throw new Error("SEED_USER_PASSWORD must be at least 12 characters");
  const demoUser = await prisma.user.upsert({
    where: { email: demoEmail },
    update: { passwordHash: await passwordHash(demoPassword), emailVerifiedAt: new Date(), firstName: "Demo", lastName: "User" },
    create: { email: demoEmail, firstName: "Demo", lastName: "User", passwordHash: await passwordHash(demoPassword), emailVerifiedAt: new Date() },
  });
  await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: demoUser.id } },
    update: { role: "OWNER" },
    create: { organizationId: org.id, userId: demoUser.id, role: "OWNER" },
  });

  const rawKey = process.env.SEED_API_KEY || `ogk_${randomBytes(24).toString("hex")}`;
  const scopes = ["projects:read","projects:write","tasks:read","tasks:write","dependencies:read","dependencies:write","resources:read","resources:write","schedule:read","schedule:write","forecast:read","connectors:read","connectors:write"];
  await prisma.apiKey.upsert({ where: { keyHash: hashKey(rawKey) }, update: { revokedAt: null, scopes }, create: { organizationId: org.id, label: "Local development key", keyHash: hashKey(rawKey), scopes } });

  let project = await prisma.project.findFirst({ where: { organizationId: org.id, name: "Sample Rollout" } });
  if (!project) {
    project = await prisma.project.create({ data: { organizationId: org.id, name: "Sample Rollout", startDate: new Date("2026-09-01") } });
    const design = await prisma.task.create({ data: { projectId: project.id, name: "Design", expectedStart: new Date("2026-09-01"), expectedEnd: new Date("2026-09-07"), durationDays: 6, isManualSchedule: true } });
    const build = await prisma.task.create({ data: { projectId: project.id, name: "Build", expectedStart: new Date("2026-09-08"), expectedEnd: new Date("2026-09-18"), durationDays: 10 } });
    await prisma.dependency.create({ data: { projectId: project.id, predecessorId: design.id, successorId: build.id, dependencyType: "FINISH_TO_START", lagDays: 0 } });
  }

  // Large Dataset Lab: deterministic, idempotent developer fixture for exercising
  // virtualization/aggregation behavior across Gantt, network, pulse, resources,
  // impact and Monte Carlo. It is deliberately isolated from Sample Rollout.
  let large = await prisma.project.findFirst({ where: { organizationId: org.id, name: "Large Dataset Lab · 300 Tasks" } });
  if (!large) {
    large = await prisma.project.create({ data: {
      organizationId: org.id,
      name: "Large Dataset Lab · 300 Tasks",
      description: "Developer fixture for large-data visualization and scheduling tests.",
      startDate: new Date("2026-09-01"),
    }});

    const taskRows: Array<{ projectId:string; name:string; taskType:"SUMMARY"|"TASK"|"MILESTONE"; expectedStart:Date; expectedEnd:Date; durationDays:number; parentId?:string; progressPct:number; sortOrder:number; targetDate:Date }> = [];
    const phases: Array<{id:string; start:Date}> = [];
    for (let phase=0; phase<12; phase++) {
      const phaseStart = new Date(Date.UTC(2026,8,1 + phase*21));
      const phaseEnd = new Date(phaseStart.getTime() + 20*DAY_MS);
      const created = await prisma.task.create({ data: { projectId:large.id, name:`Phase ${String(phase+1).padStart(2,'0')} · Workstream`, taskType:"SUMMARY", expectedStart:phaseStart, expectedEnd:phaseEnd, durationDays:20, progressPct:(phase*9)%101, sortOrder:phase*25, targetDate:new Date(phaseEnd.getTime()+2*DAY_MS) } });
      phases.push({id:created.id,start:phaseStart});
      taskRows.push({projectId:large.id,name:created.name,taskType:"SUMMARY",expectedStart:phaseStart,expectedEnd:phaseEnd,durationDays:20,parentId:undefined,progressPct:(phase*9)%101,sortOrder:phase*25,targetDate:new Date(phaseEnd.getTime()+2*DAY_MS)});
      let previousId:string|undefined;
      for (let j=0;j<24;j++) {
        const offset=j*0.75;
        const st=new Date(phaseStart.getTime()+Math.floor(offset)*DAY_MS);
        const dur=2+(j%7);
        const en=new Date(st.getTime()+dur*DAY_MS);
        const t=await prisma.task.create({ data:{ projectId:large.id, name:`P${String(phase+1).padStart(2,'0')} · Task ${String(j+1).padStart(2,'0')}`, expectedStart:st, expectedEnd:en, durationDays:dur, parentId:created.id, progressPct:(phase*17+j*3)%101, sortOrder:phase*25+j+1, targetDate:new Date(en.getTime()+(j%4===0?0:3)*DAY_MS) } });
        taskRows.push({projectId:large.id,name:t.name,taskType:"TASK",expectedStart:st,expectedEnd:en,durationDays:dur,parentId:created.id,progressPct:(phase*17+j*3)%101,sortOrder:phase*25+j+1,targetDate:new Date(en.getTime()+(j%4===0?0:3)*DAY_MS)});
        if(previousId) await prisma.dependency.create({data:{projectId:large.id,predecessorId:previousId,successorId:t.id,dependencyType:j%3===0?"START_TO_START":"FINISH_TO_START",lagDays:j%5===0?1:0}});
        previousId=t.id;
      }
    }
    // A few cross-workstream edges create realistic network density without cycles.
    const phaseTasks = await prisma.task.findMany({where:{projectId:large.id,taskType:"TASK"},orderBy:{sortOrder:"asc"},select:{id:true,sortOrder:true}});
    const extras=[] as {projectId:string;predecessorId:string;successorId:string;dependencyType:"FINISH_TO_START";lagDays:number}[];
    for(let i=0;i<phaseTasks.length-24;i+=17){ const a=phaseTasks[i], b=phaseTasks[i+24]; if(a && b) extras.push({projectId:large.id,predecessorId:a.id,successorId:b.id,dependencyType:"FINISH_TO_START",lagDays:i%2}); }
    if(extras.length) await prisma.dependency.createMany({data:extras,skipDuplicates:true});

    const resourceNames = Array.from({length:30},(_,i)=>({organizationId:org.id,name:`Lab Resource ${String(i+1).padStart(2,'0')}`,role:i%3===0?"Engineer":i%3===1?"Analyst":"Planner",capacityHoursPerDay:8}));
    await prisma.resource.createMany({data:resourceNames,skipDuplicates:true});
    const resources=await prisma.resource.findMany({where:{organizationId:org.id,name:{startsWith:"Lab Resource "}},orderBy:{name:"asc"}});
    const allTasks=await prisma.task.findMany({where:{projectId:large.id,taskType:"TASK"},orderBy:{sortOrder:"asc"},select:{id:true}});
    const assignments=allTasks.map((t,i)=>({taskId:t.id,resourceId:resources[i%resources.length].id,allocationPct:i%5===0?75:i%7===0?125:100}));
    if(assignments.length) await prisma.assignment.createMany({data:assignments,skipDuplicates:true});
    // Add a handful of milestones for visual density tests.
    for(let i=0;i<12;i++) { const d=new Date(Date.UTC(2026,8,21+i*21)); await prisma.task.create({data:{projectId:large.id,name:`Milestone ${String(i+1).padStart(2,'0')}`,taskType:"MILESTONE",expectedStart:d,expectedEnd:d,durationDays:0,parentId:phases[i].id,progressPct:i<3?100:0,sortOrder:i*25+24,targetDate:d}}); }
  }
  console.log(`Schedule Intelligence seed ready. Organization=${org.id}`);
  console.log(`Development API key: ${rawKey}`);
  console.log(`Demo login: ${demoEmail} / ${demoPassword}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
