/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required to access raw request body for Discord signature verification
  experimental: {
    serverComponentsExternalPackages: ["tweetnacl"],
  },
};

export default nextConfig;
