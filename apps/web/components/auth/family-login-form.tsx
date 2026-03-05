"use client";

import { useState } from "react";
import { createBrowserClient } from "@rooted-ems/database";

type LoginMethod = "email" | "phone";

export function FamilyLoginForm() {
  const [method, setMethod] = useState<LoginMethod>("email");
  const [value, setValue] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createBrowserClient();

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const signInOptions =
        method === "email" ? { email: value } : { phone: value };

      const { error: authError } =
        await supabase.auth.signInWithOtp(signInOptions);

      if (authError) {
        setError(authError.message);
        return;
      }

      setOtpSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const verifyOptions =
        method === "email"
          ? { email: value, token: otp, type: "email" as const }
          : { phone: value, token: otp, type: "sms" as const };

      const { error: authError } =
        await supabase.auth.verifyOtp(verifyOptions);

      if (authError) {
        setError(authError.message);
        return;
      }

      // Redirect to family dashboard on success
      window.location.href = "/family/dashboard";
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-md p-8">
        <h2 className="text-2xl font-bold text-center mb-6">Family Portal</h2>
        <p className="text-center text-gray-600 mb-6">
          Sign in to manage your enrollment applications
        </p>

        {!otpSent ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => {
                  setMethod("email");
                  setValue("");
                }}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  method === "email"
                    ? "bg-rooted-green text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Email
              </button>
              <button
                type="button"
                onClick={() => {
                  setMethod("phone");
                  setValue("");
                }}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  method === "phone"
                    ? "bg-rooted-green text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Phone
              </button>
            </div>

            <div>
              <label
                htmlFor="login-value"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {method === "email" ? "Email Address" : "Phone Number"}
              </label>
              <input
                id="login-value"
                type={method === "email" ? "email" : "tel"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={
                  method === "email"
                    ? "parent@example.com"
                    : "+1 (555) 123-4567"
                }
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !value}
              className="w-full py-2 px-4 bg-rooted-green text-white rounded-md font-medium hover:bg-rooted-green-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Sending..." : "Send Verification Code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <p className="text-sm text-gray-600 text-center">
              We sent a code to <strong>{value}</strong>
            </p>

            <div>
              <label
                htmlFor="otp-code"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Verification Code
              </label>
              <input
                id="otp-code"
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                required
                maxLength={6}
                className="w-full px-4 py-2 border border-gray-300 rounded-md text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="w-full py-2 px-4 bg-rooted-green text-white rounded-md font-medium hover:bg-rooted-green-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Verifying..." : "Verify Code"}
            </button>

            <button
              type="button"
              onClick={() => {
                setOtpSent(false);
                setOtp("");
                setError(null);
              }}
              className="w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Use a different {method === "email" ? "email" : "phone number"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
