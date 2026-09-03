import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@tlc/shared"],
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  async redirects() {
    return [
      { source: "/about_us.php", destination: "/about", permanent: true },
      { source: "/services.php", destination: "/services", permanent: true },
      { source: "/package.php", destination: "/trips", permanent: true },
      { source: "/gallery.php", destination: "/destinations", permanent: true },
      { source: "/contactus.php", destination: "/contact", permanent: true },
      { source: "/crm", destination: "/admin/crm", permanent: false },
      { source: "/admin/login", destination: "/login", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
