"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@rooted-ems/database";

type LoginMethod = "email" | "phone";

/**
 * Create a plain Supabase client (implicit flow, no PKCE) for OTP operations.
 * The @supabase/ssr createBrowserClient uses PKCE by default, which adds a
 * code_challenge to signInWithOtp. This causes verifyOtp to fail with
 * "Token has expired or is invalid" because the PKCE code_verifier exchange
 * doesn't work correctly for direct OTP code entry.
 *
 * After successful OTP verification, we transfer the session to the SSR
 * browser client so that cookies are set for server-side rendering.
 */
function createOtpClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}

export function FamilyLoginForm() {
  const [method, setMethod] = useState<LoginMethod>("email");
  const [value, setValue] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Keep a stable reference to the OTP client across renders
  const otpClientRef = useRef(createOtpClient());

  // Cooldown timer after sending OTP
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const otpClient = otpClientRef.current;

      const signInOptions =
        method === "email"
          ? { email: value }
          : { phone: value };

      const { error: authError } =
        await otpClient.auth.signInWithOtp(signInOptions);

      if (authError) {
        if (
          authError.message.toLowerCase().includes("rate limit") ||
          authError.message.toLowerCase().includes("too many")
        ) {
          setError(
            "Too many login attempts. Please wait a few minutes before trying again."
          );
          setCooldown(120);
        } else if (
          method === "phone" &&
          (authError.message.toLowerCase().includes("provider") ||
            authError.message.toLowerCase().includes("not supported") ||
            authError.message.toLowerCase().includes("phone"))
        ) {
          setError(
            "Phone login is not available yet. Please use email instead."
          );
        } else {
          setError(authError.message);
        }
        return;
      }

      setOtpSent(true);
      setCooldown(60);
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
      const otpClient = otpClientRef.current;

      const verifyOptions =
        method === "email"
          ? { email: value, token: otp, type: "email" as const }
          : { phone: value, token: otp, type: "sms" as const };

      const { data, error: authError } =
        await otpClient.auth.verifyOtp(verifyOptions);

      if (authError) {
        setError(authError.message);
        return;
      }

      // Transfer session to the SSR browser client (sets cookies for SSR)
      if (data.session) {
        const ssrClient = createBrowserClient();
        await ssrClient.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
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
        <div className="flex justify-center mb-6">
          <div className="inline-flex flex-col items-center">
            <div className="inline-flex items-baseline text-xl tracking-wide">
              <span className="text-rooted-green font-bold">rooted</span>
              <span className="text-gray-800 font-medium">schools</span>
            </div>
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center mb-2">Family Portal</h2>
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
                  setError(null);
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
                  setError(null);
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
              disabled={loading || !value || cooldown > 0}
              className="w-full py-2 px-4 bg-rooted-green text-white rounded-md font-medium hover:bg-rooted-green-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading
                ? "Sending..."
                : cooldown > 0
                  ? `Wait ${cooldown}s`
                  : "Send Verification Code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <p className="text-sm text-gray-600 text-center">
              We sent a verification{" "}
              {method === "email" ? "email" : "code"} to{" "}
              <strong>{value}</strong>
            </p>
            {method === "email" && (
              <p className="text-xs text-gray-400 text-center">
                Enter the code from the email, or click the link in the
                email to sign in directly.
              </p>
            )}

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
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="Enter code"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-md text-center text-lg tracking-wide focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || otp.length < 1}
              className="w-full py-2 px-4 bg-rooted-green text-white rounded-md font-medium hover:bg-rooted-green-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Verifying..." : "Verify Code"}
            </button>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={cooldown > 0 || loading}
                onClick={async () => {
                  setLoading(true);
                  setError(null);
                  const otpClient = otpClientRef.current;
                  const opts = method === "email" ? { email: value } : { phone: value };
                  const { error: resendErr } = await otpClient.auth.signInWithOtp(opts);
                  if (resendErr) {
                    if (resendErr.message.toLowerCase().includes("rate limit") || resendErr.message.toLowerCase().includes("too many")) {
                      setError("Too many attempts. Please wait a few minutes.");
                      setCooldown(120);
                    } else {
                      setError(resendErr.message);
                    }
                  } else {
                    setCooldown(60);
                    setError(null);
                  }
                  setLoading(false);
                }}
                className="w-full text-sm text-rooted-green hover:text-rooted-green-dark disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                {cooldown > 0
                  ? `Resend code in ${cooldown}s`
                  : "Resend verification code"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOtpSent(false);
                  setOtp("");
                  setError(null);
                  setCooldown(0);
                }}
                className="w-full text-sm text-gray-500 hover:text-gray-700"
              >
                Use a different {method === "email" ? "email" : "phone number"}
              </button>
            </div>
          </form>
        )}

        <div className="mt-6 text-center">
          <a
            href="/staff-login"
            className="text-sm text-gray-400 hover:text-gray-600 hover:underline"
          >
            Staff login
          </a>
        </div>
      </div>
    </div>
  );
}
