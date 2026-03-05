export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-rooted-gray-light">
      <div className="text-center max-w-2xl px-6">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Rooted School Foundation
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Enrollment Management System
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/family/login"
            className="px-6 py-3 bg-rooted-green text-white rounded-lg hover:bg-rooted-green-dark transition-colors"
          >
            Family Portal
          </a>
          <a
            href="/staff/login"
            className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
          >
            Staff Login
          </a>
        </div>
      </div>
    </main>
  );
}
