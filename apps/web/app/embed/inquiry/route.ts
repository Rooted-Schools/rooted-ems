import { type NextRequest } from "next/server";

/**
 * Embeddable inquiry widget loader (LG-1 Capture Kit).
 *
 * A campus marketing site drops one tag on any page:
 *   <script src="https://enroll.rootedschool.org/embed/inquiry?campus=CRN&src=healthcare-page" async></script>
 *
 * The script injects a responsive iframe pointing at /inquire with the same
 * params (so the lead is campus-preselected and source-tagged), and
 * auto-resizes to its content. No native form ever touches the school
 * website — the operating rule from the plan, enforced by construction.
 *
 * Served as application/javascript with permissive CORS: it's a public
 * capture surface meant to run on external origins.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const campus = (searchParams.get("campus") ?? "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40);
  const src = (searchParams.get("src") ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://enroll.rootedschool.org";

  const params = new URLSearchParams({ embed: "1" });
  if (campus) params.set("campus", campus);
  if (src) params.set("src", src || "website-embed");
  if (!src) params.set("src", "website-embed");
  const iframeSrc = `${base}/inquire?${params.toString()}`;

  // The script finds its own <script> tag, inserts an iframe after it, and
  // listens for postMessage height updates from the /inquire page.
  const js = `(function(){
  var s = document.currentScript;
  if (!s) { var all = document.getElementsByTagName('script'); s = all[all.length-1]; }
  var iframe = document.createElement('iframe');
  iframe.src = ${JSON.stringify(iframeSrc)};
  iframe.title = 'Rooted Schools — Request Information';
  iframe.loading = 'lazy';
  iframe.style.cssText = 'width:100%;max-width:480px;border:0;overflow:hidden;display:block;margin:0 auto;height:760px;';
  iframe.setAttribute('scrolling','no');
  s.parentNode.insertBefore(iframe, s.nextSibling);
  window.addEventListener('message', function(e){
    if (e.origin !== ${JSON.stringify(base)}) return;
    if (e.data && e.data.rootedInquiryHeight) {
      iframe.style.height = (e.data.rootedInquiryHeight + 24) + 'px';
    }
  });
})();`;

  return new Response(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
