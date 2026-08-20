# Sign-in and Email Setup

How family and staff sign-in works, and the account and dashboard settings it depends on. Written for an administrator, not a developer. These are settings in the Supabase and Google dashboards, not code changes.

Two accounts matter here:
- Supabase (the database and sign-in service for the app).
- Google Cloud (only for the optional sign-in-with-Google button).

---

## 1. Email delivery (custom SMTP)

The app sends verification codes, offers, and other messages by email. Supabase's built-in email service is rate limited to a few messages an hour, which is fine for a demo and not fine for real families. So the app is set to send through Resend, the same service the rest of the app already uses.

**What is configured** (Supabase, Authentication, Emails, SMTP Settings, "Enable Custom SMTP" on):

| Field | Value |
|---|---|
| Host | smtp.resend.com |
| Port | 465 |
| Username | resend |
| Password | a Resend API key (created in Resend, API Keys) |
| Sender email | enroll@rootedschool.org |
| Sender name | Rooted Schools Enrollment |

The sender address must be on a domain verified in Resend. rootedschool.org is verified, which is why enroll@rootedschool.org works.

**To verify it is working:** create a test family account at enroll.rootedschool.org/login with a real inbox. A code should arrive in seconds.

**If a code does not arrive:**
1. Check the Junk or Spam folder. Apple iCloud (me.com, mac.com) filters aggressively and often files a first message there. Gmail almost always shows it in the inbox.
2. Open Resend, Emails, and find the message to that address. Its status is the real answer: "Delivered" means it reached the provider and any absence is on their side (spam); "Bounced" means a domain or address problem.

---

## 2. The verification code email

The family sign-in screen asks the family to type a code. Supabase's default sign-in emails send a link, not a code, so the two did not match and families received a link with nothing to type.

**What is configured:** in Supabase, Authentication, Emails, the "Confirm signup" and "Magic Link" templates were edited to show the code using the placeholder `{{ .Token }}`. If you ever need to restore or recreate them, the body is:

```
<h2>Your Rooted Schools sign-in code</h2>
<p>Enter this code to finish signing in:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:4px;">{{ .Token }}</p>
<p>This code expires soon. If you did not request it, you can ignore this email.</p>
<hr>
<p style="font-size:14px;color:#555;"><strong>Su codigo de acceso</strong><br>
Ingrese el codigo de arriba para completar su acceso. El codigo expira pronto. Si usted no lo solicito, puede ignorar este mensaje.</p>
```

Leave the "Reset Password" template as it is. That flow uses a link on purpose, and staff password resets depend on it.

---

## 3. Google sign-in

Google sign-in works for staff and for families. It runs through a dedicated Google Cloud project named "Rooted EMS Login" that the school owns. This project was created fresh (August 2026) because the original Google client was set to Internal, meaning "this Workspace only," which let staff sign in but blocked families whose Google accounts are outside the Workspace.

**What is configured** (Google Cloud, project "Rooted EMS Login"):
- OAuth consent screen: User type External, published to Production.
- App name Rooted Schools Enrollment, home page https://enroll.rootedschool.org, privacy policy https://enroll.rootedschool.org/privacy, authorized domain rootedschool.org.
- No logo uploaded, which is deliberate: it keeps the app clear of Google's branding-verification step. The app uses only basic sign-in permissions, so no Google review is required.
- An OAuth client of type Web application, named Supabase, with authorized JavaScript origin https://enroll.rootedschool.org and authorized redirect URI https://szockdlohlmkyloubgtd.supabase.co/auth/v1/callback.

**And in Supabase** (Authentication, Providers, Google): the Client ID and Client Secret from that OAuth client are pasted in, and Google is enabled.

**First-time note for families.** A newly published Google app can show a "Google hasn't verified this app" screen on first sign-in. Choosing Advanced, then Continue completes the sign-in. This is expected for basic sign-in and clears over time.

**If you ever need to recreate the client** (for example the secret is lost): in the "Rooted EMS Login" project, APIs and Services, Credentials, create a new OAuth client of type Web application with the same redirect URI above, then paste its new Client ID and Secret into Supabase, Authentication, Providers, Google. Do not delete the old client until the new one is confirmed working.

Have counsel review the privacy policy (see section 5); it backs the production Google app and families rely on it.

## 4. Reactivating a stuck account

An account created before custom SMTP was set up may be stuck unconfirmed, because the confirmation email was rate limited and never arrived. Now that email works, the account holder can fix it themselves:

- Family: sign in again at enroll.rootedschool.org/login and request a new code.
- Staff: go to enroll.rootedschool.org/staff-login, click Forgot password, follow the emailed link, and set a password. That confirms the account in the same step.

---

## 5. The privacy policy

The privacy policy lives at https://enroll.rootedschool.org/privacy. It is bilingual and describes what the system collects, how it is used, FERPA and student records, the outside services it relies on, retention, family rights, and contact.

It is a solid draft that makes real representations to families. Have counsel review it before publishing the Google app to production and before treating it as final. It pairs with the data-processor review counsel is already doing (Resend, Twilio, Sentry, Supabase, Google).
