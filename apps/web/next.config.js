/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@rooted-ems/database",
    "@rooted-ems/types",
    "@rooted-ems/utils",
  ],
};

module.exports = nextConfig;
