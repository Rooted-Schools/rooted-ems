"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@rooted-ems/database";

type LoginMethod = "email" | "phone";

/**
 * Create a plain Supabase client (implicit flow, no PKCE) for OTP operations.
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
  const [method] = useState<LoginMethod>("email");
  const [value, setValue] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const otpClientRef = useRef(createOtpClient());

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
      const signInOptions = method === "email" ? { email: value } : { phone: value };
      const { error: authError } = await otpClient.auth.signInWithOtp(signInOptions);

      if (authError) {
        if (
          authError.message.toLowerCase().includes("rate limit") ||
          authError.message.toLowerCase().includes("too many")
        ) {
          setError("Too many login attempts. Please wait a few minutes before trying again.");
          setCooldown(120);
        } else if (
          method === "phone" &&
          (authError.message.toLowerCase().includes("provider") ||
            authError.message.toLowerCase().includes("not supported") ||
            authError.message.toLowerCase().includes("phone"))
        ) {
          setError("Phone login is not available yet. Please use email instead.");
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

      const { data, error: authError } = await otpClient.auth.verifyOtp(verifyOptions);

      if (authError) {
        setError(authError.message);
        return;
      }

      if (data.session) {
        const ssrClient = createBrowserClient();
        await ssrClient.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      window.location.href = "/family/dashboard";
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);

    try {
      const oauthClient = createBrowserClient();
      const { error: authError } = await oauthClient.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/family/dashboard`,
          queryParams: { prompt: "select_account" },
        },
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
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
              <span className="text-ink font-medium">schools</span>
            </div>
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center mb-2">Family Portal</h2>
        <p className="text-center text-ink/60 mb-6">
          Sign in to manage your enrollment applications
        </p>

        {/* Google Login */}
        <div className="mb-6">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-stone/30 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span className="text-sm font-medium text-ink">Continue with Google</span>
          </button>
        </div>

        {/* Divider */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-stone/20"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-3 text-stone">or sign in with email</span>
          </div>
        </div>

        {!otpSent ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label
                htmlFor="login-value"
                className="block text-sm font-medium text-ink/70 mb-1"
              >
                Email Address
              </label>
              <input
                id="login-value"
                type="email"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="parent@example.com"
                required
                className="w-full px-4 py-2 border border-stone/30 rounded-md focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent"
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
              className="w-full py-2 px-4 bg-rooted-green text-white rounded-md font-medium hover:bg-deep-green disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
            <p className="text-sm text-ink/60 text-center">
              We sent a verification email to{" "}
              <strong>{value}</strong>
            </p>
            <p className="text-xs text-stone text-center">
              Enter the code from the email, or click the link in the
              email to sign in directly.
            </p>

            <div>
              <label
                htmlFor="otp-code"
                className="block text-sm font-medium text-ink/70 mb-1"
              >
                Verification Code
              </label>
              <input
                id="otp-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                required
                className="w-full px-4 py-2 border border-stone/30 rounded-md text-center text-lg tracking-[0.3em] font-mono focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent"
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
              className="w-full py-2 px-4 bg-rooted-green text-white rounded-md font-medium hover:bg-deep-green disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                  const opts = { email: value };
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
                className="w-full text-sm text-rooted-green hover:text-rooted-green-dark disabled:text-stone disabled:cursor-not-allowed"
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
                className="w-full text-sm text-stone hover:text-ink"
              >
                Use a different email
              </button>
            </div>
          </form>
        )}

        <div className="mt-6 text-center">
          <a
            href="/staff-login"
            className="text-sm text-stone hover:text-ink/60 hover:underline"
          >
            Staff login
          </a>
        </div>
      </div>
    </div>
  );
}
