import Link from "next/link";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export const metadata = {
  title: "Rooted School Foundation | Enrollment Management",
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* ─── Header ─── */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt="Rooted School Foundation"
            className="h-8"
          />
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors px-3 py-2"
            >
              Family Login
            </Link>
            <Link
              href="/staff-login"
              className="text-sm font-medium text-white bg-rooted-green hover:bg-rooted-green/90 transition-colors px-4 py-2 rounded-lg"
            >
              Staff Login
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="bg-gradient-to-b from-rooted-green/5 to-white py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-3xl md:text-5xl font-bold text-gray-900 leading-tight">
            Enroll at a{" "}
            <span className="text-rooted-green">Rooted School</span>
          </h1>
          <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
            Career-connected learning that prepares students for economic
            mobility. Apply to any of our campuses below.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center px-6 py-3 text-base font-semibold text-white bg-rooted-green hover:bg-rooted-green/90 rounded-lg transition-colors shadow-sm w-full sm:w-auto"
            >
              Apply Now
            </Link>
            <Link
              href="/staff-login"
              className="inline-flex items-center justify-center px-6 py-3 text-base font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors w-full sm:w-auto"
            >
              Staff Portal
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Our Schools ─── */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-3">
            Our Schools
          </h2>
          <p className="text-gray-500 text-center mb-10 max-w-xl mx-auto">
            Rooted School Foundation operates career-connected schools across
            the country. Click a campus to start your application.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                name: "Rooted School Vancouver",
                location: "Vancouver, WA",
                grades: "Grades 9-12",
                logo: "/logos/rooted-vancouver.png",
              },
              {
                name: "C.R. Neal Academy",
                location: "Columbia, SC",
                grades: "Grades 6-12",
                logo: "/logos/cr-neal-academy.png",
              },
              {
                name: "Rooted Schools Cleveland",
                location: "Cleveland, OH",
                grades: "Grades 6-12",
                logo: "/logos/rooted-cleveland.png",
              },
            ].map((school) => (
              <Link key={school.name} href="/login">
                <div className="group border-2 border-gray-100 hover:border-rooted-green/40 rounded-xl p-6 flex flex-col items-center text-center transition-all hover:shadow-lg cursor-pointer">
                  <div className="h-28 flex items-center justify-center mb-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={school.logo}
                      alt={school.name}
                      className="max-h-28 max-w-full object-contain group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <p className="text-sm text-gray-500">{school.location}</p>
                  <p className="text-xs text-gray-400 mt-1">{school.grades}</p>
                  <span className="mt-4 inline-flex items-center text-sm font-medium text-rooted-green group-hover:underline">
                    Apply Now &rarr;
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">
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
                <div className="w-10 h-10 rounded-full bg-rooted-green text-white flex items-center justify-center text-sm font-bold mx-auto mb-3">
                  {s.step}
                </div>
                <p className="text-sm font-semibold text-gray-900">
                  {s.title}
                </p>
                <p className="text-xs text-gray-500 mt-1">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="py-8 bg-white border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt="Rooted School Foundation"
            className="h-6 opacity-60"
          />
          <div className="flex items-center gap-6 text-xs text-gray-400">
            <Link href="/login" className="hover:text-gray-600">
              Family Portal
            </Link>
            <Link href="/staff-login" className="hover:text-gray-600">
              Staff Portal
            </Link>
            <span>
              &copy; {new Date().getFullYear()} Rooted School Foundation
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
