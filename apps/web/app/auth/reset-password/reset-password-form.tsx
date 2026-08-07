"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@rooted-ems/database";
import { useLocale } from "@/lib/i18n/locale-context";

/**
 * Handles the landing side of supabase.auth.resetPasswordForEmail(): the
 * recovery link either carries a PKCE `code` param (exchanged here for a
 * session) or, on the implicit flow, has already had its tokens parsed into
 * a session by the Supabase client on load. Either way, once a session
 * exists we let the user set a new password via updateUser({ password }).
 */
export function ResetPasswordForm() {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createBrowserClient(), []);

  const [checkingLink, setCheckingLink] = useState(true);
  const [linkValid, setLinkValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function establishSession() {
      const code = searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (!cancelled) {
          setLinkValid(!exchangeError);
          setCheckingLink(false);
        }
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!cancelled) {
        setLinkValid(!!data.session);
        setCheckingLink(false);
      }
    }
    void establishSession();
    return () => {
      cancelled = true;
    };
    // Only run once on mount — searchParams/supabase are stable for this page's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(t("resetPw.tooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("resetPw.mismatch"));
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
      } else {
        setSuccess(true);
      }
    } catch {
      setError(t("resetPw.genericError"));
    } finally {
      setLoading(false);
    }
  }

  if (checkingLink) {
    return (
      <div className="w-full max-w-md mx-auto text-center text-sm text-stone">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-md p-8">
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-baseline text-xl tracking-wide">
            <span className="text-rooted-green font-bold">rooted</span>
            <span className="text-ink font-medium">schools</span>
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center mb-2">{t("resetPw.title")}</h2>

        {!linkValid ? (
          <>
            <p className="text-center text-ink/60 mb-4">{t("resetPw.invalidLink")}</p>
            <div className="flex flex-col gap-2 text-center text-sm">
              <a href="/login" className="text-rooted-green hover:underline">
                {t("resetPw.backToLogin")}
              </a>
              <a href="/staff-login" className="text-stone hover:text-ink/60 hover:underline">
                {t("login.staffLogin")}
              </a>
            </div>
          </>
        ) : success ? (
          <>
            <p className="text-center text-ink/60 mb-4">{t("resetPw.success")}</p>
            <div className="flex flex-col gap-2 text-center text-sm">
              <a href="/login" className="text-rooted-green hover:underline">
                {t("resetPw.backToLogin")}
              </a>
              <a href="/staff-login" className="text-stone hover:text-ink/60 hover:underline">
                {t("login.staffLogin")}
              </a>
            </div>
          </>
        ) : (
          <>
            <p className="text-center text-ink/60 mb-6">{t("resetPw.subtitle")}</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-ink/70 mb-1">
                  {t("resetPw.newPassword")}
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-4 py-2 border border-stone/30 rounded-md focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-ink/70 mb-1">
                  {t("resetPw.confirmPassword")}
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
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
                disabled={loading || !password || !confirmPassword}
                className="w-full py-2 px-4 bg-rooted-green text-white rounded-md font-medium hover:bg-deep-green disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? t("resetPw.submitting") : t("resetPw.submit")}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
