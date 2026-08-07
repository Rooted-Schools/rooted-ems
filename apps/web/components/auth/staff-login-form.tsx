"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@rooted-ems/database";

const ERROR_MESSAGES: Record<string, string> = {
  no_campus_access:
    "Your account is not assigned to any school campus. Please contact your school administrator to request access.",
  not_staff:
    "This Google account is not set up as a staff account. Please contact your administrator to provision your access.",
  auth_failed:
    "Authentication failed. Please try again or contact your administrator.",
};

export function StaffLoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const searchParams = useSearchParams();

  // Email/password state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const supabase = useMemo(() => createBrowserClient(), []);

  // Show error from URL params (e.g. middleware redirect)
  useEffect(() => {
    const errCode = searchParams.get("error");
    if (errCode && ERROR_MESSAGES[errCode]) {
      setError(ERROR_MESSAGES[errCode]);
    }
  }, [searchParams]);

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
      } else {
        router.push("/staff/dashboard");
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Enter your email above first, then click \"Forgot password?\"");
      return;
    }
    setLoading(true);
    setError(null);
    setResetSent(false);
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      setResetSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);

    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/staff/dashboard`,
          queryParams: {
            hd: "*", // Allow any Google Workspace domain
          },
        },
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
      }
      // Browser will redirect to Google — no need to handle success here
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
        <h2 className="text-2xl font-bold text-center mb-2">Staff Console</h2>
        <p className="text-center text-ink/60 mb-6">
          Sign in to access your campus dashboard
        </p>

        {error && (
          <p className="text-sm text-red-600 text-center mb-4" role="alert">
            {error}
          </p>
        )}
        {resetSent && (
          <p className="text-sm text-rooted-green text-center mb-4" role="status">
            If an account exists for {email}, a password reset link has been sent.
          </p>
        )}

        <form onSubmit={handleEmailLogin} className="space-y-3">
          <div>
            <label htmlFor="staff-email" className="block text-sm font-medium text-ink/70 mb-1">
              Email
            </label>
            <input
              id="staff-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@rootedschool.org"
              className="w-full px-3 py-2 border border-stone/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
              required
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="staff-password" className="block text-sm font-medium text-ink/70">
                Password
              </label>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
                className="text-xs text-rooted-green hover:underline disabled:opacity-50"
              >
                Forgot password?
              </button>
            </div>
            <input
              id="staff-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full px-3 py-2 border border-stone/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full py-3 px-4 bg-rooted-green text-white rounded-md font-medium hover:bg-rooted-green/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-stone/20" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-ink/40">or</span>
          </div>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border border-stone/30 rounded-md font-medium text-ink hover:bg-rooted-gray-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          {loading ? "Redirecting..." : "Sign in with Google"}
        </button>

        <div className="mt-6 text-center">
          <a
            href="/login"
            className="text-sm text-rooted-green hover:underline"
          >
            Family login
          </a>
        </div>

        <p className="mt-5 text-xs text-center text-stone/70 leading-relaxed">
          Access to this system is restricted to authorized staff. Student
          records are protected under FERPA — unauthorized access or
          disclosure is prohibited.
        </p>
      </div>
    </div>
  );
}
