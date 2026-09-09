// Window-open load test for Rooted EMS.
//
// Simulates the traffic spike when an application window opens: many families
// landing on the public pages at once. This exercises the read-heavy public
// surface (marketing/landing, the lottery explainer, per-campus landing, the
// inquiry form) that every applicant hits before signing in.
//
// It is deliberately READ-ONLY (GET). It does not submit inquiries or
// applications, so it is safe to point at production, though a preview or
// staging deployment is the better target. The authenticated submit path is
// gated behind Supabase email OTP and cannot be driven from a load generator
// without real inboxes; see docs/launch/window-open-readiness.md for how that
// path is covered (idempotent submit + the auth-email rate-limit caveat).
//
// Run:
//   BASE_URL=https://enroll.rootedschool.org CAMPUS_SLUG=vancouver \
//     k6 run scripts/load/window-open.k6.js
//
// Tune the spike with VUS (peak concurrent virtual users) and DURATION.
// Install k6: https://grafana.com/docs/k6/latest/set-up/install-k6/

import http from "k6/http";
import { check, group, sleep } from "k6";

const BASE_URL = (__ENV.BASE_URL || "https://enroll.rootedschool.org").replace(/\/$/, "");
const CAMPUS_SLUG = __ENV.CAMPUS_SLUG || "vancouver";
const PEAK_VUS = Number(__ENV.VUS || 200);

export const options = {
  scenarios: {
    // Ramp to a burst, hold, then ease off, mimicking a window-open surge.
    window_open_surge: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: __ENV.RAMP || "30s", target: PEAK_VUS },
        { duration: __ENV.HOLD || "2m", target: PEAK_VUS },
        { duration: "30s", target: 0 },
      ],
      gracefulStop: "15s",
    },
  },
  thresholds: {
    // Fail the run if the public surface degrades: >1% errors or a slow p95.
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"],
  },
};

const pages = [
  { name: "landing", path: "/" },
  { name: "how-the-lottery-works", path: "/how-the-lottery-works" },
  { name: "campus-landing", path: `/${CAMPUS_SLUG}` },
  { name: "inquiry-form", path: "/inquire" },
];

export default function () {
  group("public window-open pages", () => {
    for (const page of pages) {
      const res = http.get(`${BASE_URL}${page.path}`, {
        tags: { page: page.name },
        headers: { "Accept": "text/html" },
      });
      check(res, {
        [`${page.name} status is 200`]: (r) => r.status === 200,
        [`${page.name} returned html`]: (r) =>
          String(r.headers["Content-Type"] || "").includes("text/html"),
      });
      // A short think-time between page views so a single VU models a person
      // browsing, not a tight hammer loop.
      sleep(Math.random() * 2 + 1);
    }
  });
}
