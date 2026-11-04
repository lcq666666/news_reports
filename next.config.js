/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export so the site can be hosted on GitHub Pages without a server.
  output: "export",
  // For local preview this stays empty. When deploying to
  // https://<user>.github.io/news_reports/ set PAGES_BASE_PATH=/news_reports
  // at build time (see README.md). Do not hard-code a username here.
  basePath: process.env.PAGES_BASE_PATH || "",
  assetPrefix: process.env.PAGES_BASE_PATH || "",
  images: { unoptimized: true },
  trailingSlash: true,
};

module.exports = nextConfig;
