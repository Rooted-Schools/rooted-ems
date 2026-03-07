"use client";

import { useState } from "react";
import { GRADE_LABELS } from "@/lib/application-helpers";

interface Campus {
  id: string;
  name: string;
  gradeCodes: string[];
}

interface InquiryFormProps {
  campuses: Campus[];
}

export function InquiryForm({ campuses }: InquiryFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const [submittedCampusName, setSubmittedCampusName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [campusId, setCampusId] = useState("");
  const [studentFirst, setStudentFirst] = useState("");
  const [studentLast, setStudentLast] = useState("");
  const [grade, setGrade] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [source, setSource] = useState("website");

  // Get the selected campus and its available grades
  const selectedCampus = campuses.find((c) => c.id === campusId);
  const availableGrades = selectedCampus?.gradeCodes ?? [];

  function handleCampusChange(newCampusId: string) {
    setCampusId(newCampusId);
    // Reset grade when campus changes (selected grade may not be valid for new campus)
    setGrade("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!campusId) {
      setError("Please select a school.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campus_id: campusId,
          student_first_name: studentFirst,
          student_last_name: studentLast,
          grade_applying: grade,
          guardian_name: guardianName,
          guardian_email: guardianEmail,
          guardian_phone: guardianPhone,
          source,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }

      setSubmittedCampusName(selectedCampus?.name ?? "");
      setSubmitted(true);
    } catch {
      setError("Unable to submit. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <div className="w-16 h-16 bg-rooted-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-rooted-green"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Thank You!
        </h2>
        <p className="text-gray-600 mb-6">
          We&apos;ve received your interest form.
          {submittedCampusName
            ? ` The enrollment team at ${submittedCampusName} will reach out to you soon with next steps.`
            : " Our enrollment team will reach out to you soon with next steps."}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/login"
            className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold text-white bg-rooted-green hover:bg-rooted-green/90 rounded-lg transition-colors"
          >
            Apply Now
          </a>
          <a
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
          >
            Back to Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-8">
      <div className="flex justify-center mb-6">
        <div className="inline-flex flex-col items-center">
          <div className="inline-flex items-baseline text-xl tracking-wide">
            <span className="text-rooted-green font-bold">rooted</span>
            <span className="text-gray-800 font-medium">schools</span>
          </div>
        </div>
      </div>
      <h2 className="text-2xl font-bold text-center mb-2">
        Express Your Interest
      </h2>
      <p className="text-center text-gray-600 mb-6">
        Interested in enrolling? Fill out this quick form and your
        school&apos;s enrollment team will follow up with you.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Campus Selection — Required */}
        <div>
          <label
            htmlFor="campus"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Which school are you interested in? *
          </label>
          <select
            id="campus"
            value={campusId}
            onChange={(e) => handleCampusChange(e.target.value)}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent bg-white"
          >
            <option value="">Select a school</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Student Info */}
        <fieldset>
          <legend className="text-sm font-semibold text-gray-900 mb-2">
            Student Information
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="student-first"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                First Name *
              </label>
              <input
                id="student-first"
                type="text"
                value={studentFirst}
                onChange={(e) => setStudentFirst(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent"
              />
            </div>
            <div>
              <label
                htmlFor="student-last"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Last Name *
              </label>
              <input
                id="student-last"
                type="text"
                value={studentLast}
                onChange={(e) => setStudentLast(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent"
              />
            </div>
          </div>
          <div className="mt-3">
            <label
              htmlFor="grade"
              className="block text-xs font-medium text-gray-600 mb-1"
            >
              Grade Applying For *
            </label>
            {campusId ? (
              <select
                id="grade"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent bg-white"
              >
                <option value="">Select grade</option>
                {availableGrades.map((code) => (
                  <option key={code} value={code}>
                    {GRADE_LABELS[code] ?? `Grade ${code}`}
                  </option>
                ))}
              </select>
            ) : (
              <select
                id="grade"
                disabled
                className="w-full px-4 py-2 border border-gray-200 rounded-md bg-gray-50 text-gray-400 cursor-not-allowed"
              >
                <option>Select a school first</option>
              </select>
            )}
          </div>
        </fieldset>

        {/* Guardian Info */}
        <fieldset>
          <legend className="text-sm font-semibold text-gray-900 mb-2">
            Parent / Guardian Information
          </legend>
          <div>
            <label
              htmlFor="guardian-name"
              className="block text-xs font-medium text-gray-600 mb-1"
            >
              Full Name *
            </label>
            <input
              id="guardian-name"
              type="text"
              value={guardianName}
              onChange={(e) => setGuardianName(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div>
              <label
                htmlFor="guardian-email"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Email Address
              </label>
              <input
                id="guardian-email"
                type="email"
                value={guardianEmail}
                onChange={(e) => setGuardianEmail(e.target.value)}
                placeholder="parent@example.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent"
              />
            </div>
            <div>
              <label
                htmlFor="guardian-phone"
                className="block text-xs font-medium text-gray-600 mb-1"
              >
                Phone Number
              </label>
              <input
                id="guardian-phone"
                type="tel"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent"
              />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Please provide at least one way to reach you.
          </p>
        </fieldset>

        {/* How did you hear */}
        <div>
          <label
            htmlFor="source"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            How did you hear about us?
          </label>
          <select
            id="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent bg-white"
          >
            <option value="website">Website</option>
            <option value="word_of_mouth">Word of Mouth</option>
            <option value="social_media">Social Media</option>
            <option value="community_event">Community Event</option>
            <option value="partner_referral">Partner Referral</option>
            <option value="other">Other</option>
          </select>
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-rooted-green text-white rounded-md font-semibold hover:bg-rooted-green/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Submitting..." : "Submit Interest Form"}
        </button>
      </form>

      <div className="mt-6 pt-4 border-t border-gray-100 text-center space-y-2">
        <p className="text-sm text-gray-500">
          Ready to apply?{" "}
          <a
            href="/login"
            className="text-rooted-green hover:underline font-medium"
          >
            Start your application
          </a>
        </p>
        <a
          href="/"
          className="text-xs text-gray-400 hover:text-gray-600 hover:underline"
        >
          Back to home
        </a>
      </div>
    </div>
  );
}
