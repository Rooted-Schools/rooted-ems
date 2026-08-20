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

Sign-in with a Google account already works for staff, because staff use rootedschool.org Workspace accounts and the Google app is set to Internal, meaning "this Workspace only." Families sign in from outside that Workspace, so for them Google is blocked until the app is set to External. Family email sign-in works regardless, so Google is a convenience, not a requirement.

**Finding the right Google project.** Sign-in runs through one specific Google project, the one whose OAuth consent screen lists enroll.rootedschool.org as its App domain home page. Its name may be misleading (it was seen as "RSF Claude Integration"), so identify it by that home page, not the name. If in doubt, in Supabase, Authentication, Providers, Google, copy the Client ID, then search that Client ID in the Google Cloud top search bar to jump straight to the right project.

**For a few named testers, today (no privacy policy needed):**
1. In that Google project, left menu, Audience.
2. Set User type to External. Do not click Publish. Leave the status on Testing.
3. Add users, and add each tester's Google address (for example a personal gmail).
Those specific accounts can now sign in with Google. Everyone else still uses email.

**For all families (production):**
1. Same Audience page, click Publish app to move it to Production.
2. When asked for a privacy policy link, use https://enroll.rootedschool.org/privacy.
3. The app uses only basic sign-in permissions, so no lengthy Google review is required. If Google asks to verify branding because of the uploaded logo, either remove the logo to publish immediately and add it back later, or complete branding verification.

Do the counsel review of the privacy policy (see section 5) before publishing to production.

---

## 4. Reactivating a stuck account

An account created before custom SMTP was set up may be stuck unconfirmed, because the confirmation email was rate limited and never arrived. Now that email works, the account holder can fix it themselves:

- Family: sign in again at enroll.rootedschool.org/login and request a new code.
- Staff: go to enroll.rootedschool.org/staff-login, click Forgot password, follow the emailed link, and set a password. That confirms the account in the same step.

---

## 5. The privacy policy

The privacy policy lives at https://enroll.rootedschool.org/privacy. It is bilingual and describes what the system collects, how it is used, FERPA and student records, the outside services it relies on, retention, family rights, and contact.

It is a solid draft that makes real representations to families. Have counsel review it before publishing the Google app to production and before treating it as final. It pairs with the data-processor review counsel is already doing (Resend, Twilio, Sentry, Supabase, Google).
