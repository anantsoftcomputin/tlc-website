import type { NextConfig } from "next";
import path from "node:path";
import { appCheckDeployProblem } from "./src/lib/security/app-check-policy";

const appCheckProblem = appCheckDeployProblem();
if (appCheckProblem) throw new Error(appCheckProblem);

const nextConfig: NextConfig = {
  transpilePackages: ["@tlc/shared", "@tlc/ai-chat"],
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      // TBO supplier property photos.
      { protocol: "https", hostname: "www.tboholidays.com" },
      { protocol: "https", hostname: "api.tbotechnology.in" },
    ],
  },
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
