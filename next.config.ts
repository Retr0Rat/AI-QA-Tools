import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @google-cloud/storage uses Node.js APIs not available in edge runtime
  serverExternalPackages: ['@google-cloud/storage'],
};

export default nextConfig;
