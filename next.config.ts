import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// SP-047: request config lives in lib/i18n (not the default ./i18n path).
const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // SP-039 4B: the claim invitation token travels as a PATH segment.
        // Strip referrers so outbound navigation never leaks the URL, and keep
        // the whole /claim subtree out of search indexes. The claim routes stay
        // UNPREFIXED (outside /[locale]) so this matcher and every invitation
        // already sent during SP-039P keep working unchanged (SP-047 §8).
        source: "/claim/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
