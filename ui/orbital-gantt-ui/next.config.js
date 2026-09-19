/** @type {import('next').NextConfig} */
const apiOrigin = process.env.API_INTERNAL_URL || "http://api:4000";
module.exports = { reactStrictMode: true, async rewrites(){ return [{source:"/api/:path*", destination:`${apiOrigin}/:path*`}]; } };
