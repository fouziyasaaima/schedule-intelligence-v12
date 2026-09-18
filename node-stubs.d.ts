declare var process:any; declare var Buffer:any;
declare module 'node:crypto' { export const createCipheriv:any; export const createDecipheriv:any; export const createHash:any; export const randomBytes:any; }
declare module 'node:dns/promises' { const dns:any; export default dns; }
