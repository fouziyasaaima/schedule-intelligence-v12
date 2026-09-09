import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "./db";
const scrypt = promisify(_scrypt);
const SESSION_COOKIE = "orbital_session";
const SESSION_DAYS = 7;
const hash = (v:string) => createHash("sha256").update(v).digest("hex");
async function passwordHash(password:string){ const salt=randomBytes(16).toString("hex"); const derived=await scrypt(password,salt,64) as Buffer; return `scrypt$${salt}$${derived.toString("hex")}`; }
async function passwordVerify(password:string, encoded:string){ const [scheme,salt,hex]=encoded.split("$"); if(scheme!=="scrypt"||!salt||!hex)return false; const derived=await scrypt(password,salt,64) as Buffer; const stored=Buffer.from(hex,"hex"); return stored.length===derived.length && timingSafeEqual(stored,derived); }
function newToken(prefix:string){ return `${prefix}_${randomBytes(32).toString("base64url")}`; }
export async function createSession(userId:string, reply:FastifyReply){ const raw=newToken("os"); await prisma.session.create({data:{userId,tokenHash:hash(raw),expiresAt:new Date(Date.now()+SESSION_DAYS*86400000)}}); reply.setCookie(SESSION_COOKIE,raw,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:SESSION_DAYS*86400}); return raw; }
export async function clearSession(req:FastifyRequest,reply:FastifyReply){ const raw=req.cookies?.[SESSION_COOKIE]; if(raw) await prisma.session.deleteMany({where:{tokenHash:hash(raw)}}); reply.clearCookie(SESSION_COOKIE,{path:"/"}); }
export async function currentUser(req:FastifyRequest){ const raw=req.cookies?.[SESSION_COOKIE]; if(!raw)return null; const session=await prisma.session.findUnique({where:{tokenHash:hash(raw)},include:{user:{include:{memberships:{include:{organization:true}}}}}}); if(!session||session.expiresAt<=new Date()){ if(session)await prisma.session.delete({where:{id:session.id}}); return null; } await prisma.session.update({where:{id:session.id},data:{lastSeenAt:new Date()}}); return session.user; }
export { passwordHash,passwordVerify,hash,SESSION_COOKIE };
