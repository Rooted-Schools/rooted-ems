import Link from "next/link";
import { createServiceClient } from "@rooted-ems/database/service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export const metadata = {
  title: "rootedschools | Enrollment Management",
};

function formatCloseDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/* Campus accent color classes keyed by matchKey */
const campusAccent: Record<string, { border: string; bg: string; text: string; hoverBorder: string }> = {
  vancouver: {
    border: "border-campus-vancouver/40",
    bg: "bg-campus-vancouver/10",
    text: "text-campus-vancouver",
    hoverBorder: "hover:border-campus-vancouver/60",
  },
  neal: {
    border: "border-campus-neal/40",
    bg: "bg-campus-neal/10",
    text: "text-campus-neal",
    hoverBorder: "hover:border-campus-neal/60",
  },
  cleveland: {
    border: "border-campus-cleveland/40",
    bg: "bg-campus-cleveland/10",
    text: "text-campus-cleveland",
    hoverBorder: "hover:border-campus-cleveland/60",
  },
};

async function getPublicEnrollmentWindows() {
  const supabase = createServiceClient();
  const now = new Date();
  const nowIso = now.toISOString();

  const { data, error } = await supabase
    .from("enrollment_window")
    .select(`id, name, open_date, close_date, status, campus:campus_id (id, name)`)
    .gte("close_date", nowIso)
    .eq("status", "open")
    .order("open_date", { ascending: true });

  if (error) {
    console.error("[homepage/getEnrollmentWindows]", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const campus = row.campus as Record<string, string> | null;
    const openDate = new Date(row.open_date as string);
    const closeDate = new Date(row.close_date as string);
    const isOpen = now >= openDate && now <= closeDate;

    let daysRemaining: number | null = null;
    if (isOpen) {
      daysRemaining = Math.ceil(
        (closeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    return {
      campus_name: campus?.name ?? "",
      campus_id: campus?.id ?? "",
      is_open: isOpen,
      close_date: closeDate.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      days_remaining: daysRemaining,
    };
  });
}

export default async function HomePage() {
  // Fetch enrollment windows from DB (service client bypasses RLS for public page)
  const windows = await getPublicEnrollmentWindows();

  // Static school data with match keys to link to DB enrollment windows
  const schoolDefs = [
    {
      name: "rootedschools vancouver",
      location: "Vancouver, WA",
      grades: "Grades 9-12",
      logo: "/logos/rooted-vancouver.png",
      matchKey: "vancouver",
    },
    {
      name: "C.R. Neal Academy",
      location: "Columbia, SC",
      grades: "Grades 6-12",
      logo: "/logos/cr-neal-academy.png",
      matchKey: "neal",
    },
    {
      name: "rootedschools cleveland",
      location: "Cleveland, OH",
      grades: "Grades 6-12",
      logo: "/logos/rooted-cleveland.png",
      matchKey: "cleveland",
    },
  ];

  // Match each school to its enrollment window status
  const schools = schoolDefs.map((school) => {
    const match = windows.find((w) =>
      w.campus_name.toLowerCase().includes(school.matchKey)
    );
    return {
      ...school,
      isOpen: match?.is_open ?? false,
      closeDate: match?.close_date ?? null,
      daysRemaining: match?.days_remaining ?? null,
      campusId: match?.campus_id ?? null,
    };
  });

  const anyOpen = schools.some((s) => s.isOpen);

  return (
    <div className="min-h-screen bg-warm-white">
      {/* ─── Header ─── */}
      <header className="bg-white border-b border-rooted-gray">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt="rootedschools"
            className="h-8"
          />
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-ink/60 hover:text-ink transition-colors px-3 py-2"
            >
              Family Login
            </Link>
            <Link
              href="/staff-login"
              className="text-sm font-medium text-white bg-rooted-green hover:bg-deep-green transition-colors px-4 py-2 rounded-lg"
            >
              Staff Login
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="bg-gradient-to-b from-rooted-green/5 to-warm-white py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-3xl md:text-5xl text-ink leading-tight">
            Enroll at a{" "}
            <span className="text-rooted-green">
              <span className="font-bold">rooted</span>
              <span className="font-normal">school</span>
            </span>
          </h1>
          <p className="mt-4 text-lg text-ink/60 max-w-2xl mx-auto">
            Career-connected learning that prepares students for economic
            mobility.{" "}
            {anyOpen
              ? "Apply to any of our campuses with open enrollment below."
              : "Express your interest and we'll notify you when enrollment opens."}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            {anyOpen ? (
              <Link
                href="/login"
                className="inline-flex items-center justify-center px-6 py-3 text-base font-semibold text-white bg-rooted-green hover:bg-deep-green rounded-lg transition-colors shadow-sm w-full sm:w-auto"
              >
                Apply Now
              </Link>
            ) : null}
            <Link
              href="/inquiry"
              className={`inline-flex items-center justify-center px-6 py-3 text-base font-medium rounded-lg transition-colors w-full sm:w-auto ${
                anyOpen
                  ? "text-ink/70 bg-white border border-stone/40 hover:bg-rooted-gray-light"
                  : "text-white bg-rooted-green hover:bg-deep-green shadow-sm font-semibold"
              }`}
            >
              Express Interest
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Our Schools ─── */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-ink text-center mb-3">
            Our Schools
          </h2>
          <p className="text-stone text-center mb-10 max-w-xl mx-auto">
            <span className="font-bold">rooted</span>schools operates career-connected schools across
            the country.{" "}
            {anyOpen
              ? "Click a campus to start your application."
              : "Express your interest to get notified when enrollment opens."}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {schools.map((school) => {
              const accent = campusAccent[school.matchKey];
              return (
                <div
                  key={school.name}
                  className={`group border-2 rounded-xl p-6 flex flex-col items-center text-center transition-all hover:shadow-lg ${
                    school.isOpen
                      ? `border-rooted-gray ${accent?.hoverBorder ?? "hover:border-rooted-green/40"}`
                      : "border-rooted-gray hover:border-stone/40"
                  }`}
                >
                  <div className="h-28 flex items-center justify-center mb-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={school.logo}
                      alt={school.name}
                      className="max-h-28 max-w-full object-contain group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <p className="text-sm text-stone">{school.location}</p>
                  <p className="text-xs text-stone/70 mt-1">{school.grades}</p>

                  {/* Enrollment Status Badge — campus accent color */}
                  {school.isOpen ? (
                    <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full ${accent?.bg ?? "bg-rooted-green/10"} border ${accent?.border ?? "border-rooted-green/20"}`}>
                      <span className={`w-2 h-2 rounded-full ${accent?.text ? accent.text.replace("text-", "bg-") : "bg-rooted-green"} animate-pulse`} />
                      <span className={`text-xs font-semibold ${accent?.text ?? "text-rooted-green"}`}>
                        Open Enrollment
                      </span>
                    </div>
                  ) : (
                    <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rooted-gray border border-rooted-gray-dark">
                      <span className="w-2 h-2 rounded-full bg-stone" />
                      <span className="text-xs font-medium text-stone">
                        Enrollment Closed
                      </span>
                    </div>
                  )}

                  {/* Close date info */}
                  {school.isOpen && school.closeDate && (
                    <p className="text-[11px] text-stone mt-1.5">
                      Closes {formatCloseDate(school.closeDate)}
                      {school.daysRemaining !== null && school.daysRemaining <= 14 && (
                        <span className="text-amber-600 font-semibold">
                          {" "}({school.daysRemaining} day{school.daysRemaining !== 1 ? "s" : ""} left)
                        </span>
                      )}
                    </p>
                  )}

                  {/* CTAs */}
                  <div className="mt-4 flex gap-2">
                    {school.isOpen ? (
                      <>
                        <Link
                          href="/login"
                          className="inline-flex items-center text-sm font-medium text-white bg-rooted-green hover:bg-deep-green px-4 py-2 rounded-lg transition-colors"
                        >
                          Apply Now
                        </Link>
                        <Link
                          href="/inquiry"
                          className="inline-flex items-center text-sm font-medium text-rooted-green border border-rooted-green/30 hover:bg-rooted-green/5 px-4 py-2 rounded-lg transition-colors"
                        >
                          Learn More
                        </Link>
                      </>
                    ) : (
                      <Link
                        href="/inquiry"
                        className="inline-flex items-center text-sm font-medium text-white bg-rooted-green hover:bg-deep-green px-4 py-2 rounded-lg transition-colors"
                      >
                        Express Interest
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Express Interest CTA ─── */}
      <section className="py-16 bg-rooted-green/5 border-y border-rooted-green/10">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-sm font-semibold text-rooted-green uppercase tracking-wider mb-2">
            {anyOpen ? "Not ready to apply?" : "Stay Connected"}
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-ink mb-3">
            Express Your Interest
          </h2>
          <p className="text-ink/60 max-w-xl mx-auto mb-8">
            {anyOpen
              ? <>Complete a short form and our team will share more information about our schools, upcoming enrollment windows, and how{" "}<span className="font-bold">rooted</span>schools prepares students for economic mobility.</>
              : <>Enrollment is currently closed. Fill out a quick form and we&apos;ll notify you when enrollment opens for the next school year at any of our <span className="font-bold">rooted</span>schools campuses.</>
            }
          </p>
          <Link
            href="/inquiry"
            className="inline-flex items-center justify-center px-8 py-3.5 text-base font-semibold text-white bg-rooted-green hover:bg-deep-green rounded-lg transition-colors shadow-sm"
          >
            Express Interest &rarr;
          </Link>
          <p className="text-xs text-stone mt-4">
            No commitment required. We&apos;ll follow up to answer your questions.
          </p>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section className="py-16 bg-rooted-gray-light">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-ink text-center mb-10">
            How Enrollment Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[
              {
                step: 1,
                title: "Apply",
                desc: "Complete a short online application for your child.",
              },
              {
                step: 2,
                title: "Review",
                desc: "Our team verifies your application and documents.",
              },
              {
                step: 3,
                title: "Lottery",
                desc: "If oversubscribed, a fair lottery determines placement.",
              },
              {
                step: 4,
                title: "Offer",
                desc: "Receive and accept your seat offer within the deadline.",
              },
              {
                step: 5,
                title: "Register",
                desc: "Complete registration to finalize enrollment.",
              },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <div className="w-10 h-10 rounded-full bg-deep-green text-white flex items-center justify-center text-sm font-bold mx-auto mb-3">
                  {s.step}
                </div>
                <p className="text-sm font-semibold text-ink">
                  {s.title}
                </p>
                <p className="text-xs text-stone mt-1">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="py-8 bg-deep-green">
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-sm tracking-wide">
            <span className="text-white font-bold">rooted</span><span className="text-white/70 font-medium">schools</span>
          </span>
          <div className="flex items-center gap-6 text-xs text-white/60">
            <Link href="/inquiry" className="hover:text-white transition-colors">
              Express Interest
            </Link>
            <Link href="/login" className="hover:text-white transition-colors">
              Family Portal
            </Link>
            <Link href="/staff-login" className="hover:text-white transition-colors">
              Staff Portal
            </Link>
            <span>
              &copy; {new Date().getFullYear()} <span className="font-bold">rooted</span>schools
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
