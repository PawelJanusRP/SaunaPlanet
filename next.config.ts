import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // SP-039 4B: the claim invitation token travels as a PATH segment.
        // Strip referrers so outbound navigation never leaks the URL, and keep
        // the whole /claim subtree out of search indexes.
        source: "/claim/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
