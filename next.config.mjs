/** @type {import('next').NextConfig} */
const nextConfig = {
  // Screenshots are sent as base64 to our API route; allow a generous body limit.
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
