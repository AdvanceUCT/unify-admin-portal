import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    authInterrupts: true,
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "www.voskuils.com",
          },
        ],
        destination: "https://voskuils.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
