/** @type {import('next').NextConfig} */
const apiOrigin = process.env.API_INTERNAL_URL || "http://api:4000";
const frameAncestors = process.env.EMBED_ALLOWED_ORIGINS || (process.env.NODE_ENV === "production" ? "'self'" : "*");
module.exports = {
  reactStrictMode: true,
  async rewrites(){ return [{source:"/api/:path*", destination:`${apiOrigin}/:path*`}]; },
  async headers(){ return [{ source:"/:path*", headers:[{ key:"Content-Security-Policy", value:`frame-ancestors ${frameAncestors};` }] }]; },
};
