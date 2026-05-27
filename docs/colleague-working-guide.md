# Working in Rooted EMS with Claude Code
### Your Day-to-Day Guide

This guide covers everything you need once you're set up — how to make changes, test them, save them, and collaborate with Steven without stepping on each other's work.

If you haven't completed the setup yet, do that first: see `colleague-setup-guide.md`.

---

## The Big Picture

Here's how this works:

- **The code** lives on GitHub (the cloud). Think of it like Google Drive for code.
- **Your local copy** lives on your computer. This is where you actually make changes.
- **Claude Code** is your AI assistant. You describe what you want in plain English and it makes the changes for you.
- **Git** is the tool that syncs your local copy with GitHub so Steven can see your changes too.

The flow every time you work:
```
Pull latest → Open Claude Code → Make changes → Test → Save & Push
```

---

## Every Time You Sit Down to Work

### Step 1 — Pull the latest changes first

Before opening Claude Code, you need to grab any changes Steven made since you last worked. This takes 30 seconds and prevents conflicts.

1. Press the **Windows key**, type **PowerShell**, press **Enter**
2. Navigate to the project:
   ```
   cd ~\rooted-ems
   ```
3. Pull the latest changes:
   ```
   git pull
   ```

You'll see one of two things:
- `Already up to date.` — nothing new, you're good to go
- A list of files — Steven made changes and they've been downloaded

**Keep PowerShell open** — you'll need it later to save and share your work.

### Step 2 — Open Claude Code Desktop

1. Click the **Claude** icon in your taskbar or Start menu
2. If it asks you to open a project or folder, click **Open Folder**
3. Navigate to your home folder → open **rooted-ems**
4. Click **Select Folder**

Claude will read the project automatically and know the full codebase. You'll see the chat interface — just start typing what you want to change.

> **Already have a session open?** If Claude Code is already open from a previous session, make sure you're in the right project. You should see `rooted-ems` somewhere at the top of the window. If not, go to **File → Open Folder** and navigate to the `rooted-ems` folder.

---

## How to Work with Claude Code

Claude Code understands plain English. You don't need to know how to code. Just describe what you want as clearly as possible.

### Good ways to ask for changes:

**Be specific about what you want:**
> "On the staff applications page, change the button that says 'Review' to say 'Open Application'"

**Describe the problem you're seeing:**
> "When a family submits an application, they don't get a confirmation message. Can you add one?"

**Reference the part of the app:**
> "In the family registration form, the section for uploading documents is confusing. Can you add a short description explaining what each document is for?"

**Ask questions before making changes:**
> "Where in the code does the application status get updated when staff approve something?"

### Tips for getting good results:

- **Be specific.** "Make it better" is hard to act on. "Move the Submit button to the bottom of the form" is clear.
- **One change at a time.** Don't ask for 5 things at once — do them one by one so you can test each one.
- **Ask it to explain.** If Claude does something and you're not sure what changed, ask: *"What exactly did you just change and why?"*
- **Ask before it acts.** If you're unsure, say: *"Don't make any changes yet — just tell me what you would do and I'll confirm."*

---

## How to See Your Changes in the Browser

After Claude makes a change, you'll want to see it in the actual app before saving it.

### Start the app:

Open a **second PowerShell window** (don't close the one with Claude Code open):
1. Press Windows key → type PowerShell → press Enter
2. Navigate to the project:
   ```
   cd ~\rooted-ems
   ```
3. Start the app:
   ```
   pnpm turbo run dev --filter=web
   ```
4. Wait until you see something like `ready on http://localhost:3000`
5. Open your browser and go to:
   - **Family portal:** `http://localhost:3000/login`
   - **Staff portal:** `http://localhost:3000/staff-login`

### Refresh to see changes:

Every time Claude makes a change, go to your browser and press **Ctrl + R** (or **F5**) to refresh the page. Most changes will appear immediately.

### Stop the app when you're done:

Go back to the PowerShell window running the app and press **Ctrl + C**.

---

## Saving and Sharing Your Changes

Once you've made a change and tested it, you need to save it to GitHub so Steven can see it.

This is a three-step process. Run these commands in the Claude Code PowerShell window (not the one running the app).

### Step 1 — Stage your changes (tell git what to save):
```
git add -A
```

### Step 2 — Commit your changes (give them a label):
```
git commit -m "describe what you changed"
```

Replace the description with something that explains what you did. Keep it short and clear. Examples:
- `git commit -m "updated the document upload instructions in registration form"`
- `git commit -m "fixed typo on family dashboard welcome message"`
- `git commit -m "added confirmation message after application is submitted"`

### Step 3 — Push to GitHub (share it with Steven):
```
git push
```

You'll see some text confirming the push worked. That's it — Steven can now see your changes.

---

## Checking What You've Changed Before Saving

Not sure what Claude changed? Run this to see a summary:

```
git status
```

This shows you which files were modified. To see the exact changes inside a file:

```
git diff
```

Press **Q** to exit the diff view.

---

## What to Do If Something Goes Wrong

### "I made a change and the app broke"

Don't panic. Tell Claude Code exactly what happened:
> "The app is showing an error after the change you just made. Here's what I see: [describe or paste the error]. Can you fix it?"

Claude can diagnose and fix most errors.

### "I want to undo what Claude just did"

In Claude Code, type:
> "Undo the last change you made"

Or if you want to go back to the last saved version before any changes in this session:
```
git checkout .
```
⚠️ This undoes ALL unsaved changes since your last commit. Only use it if you want a clean slate.

### "git push failed"

This usually means Steven pushed changes while you were working and your copy is behind. Run:
```
git pull
```
Then try `git push` again.

### "There's a merge conflict"

This means you and Steven edited the same part of the same file. Don't try to fix it manually. Tell Claude Code:
> "I have a merge conflict. Can you help me resolve it?"

Paste any error text it shows you and Claude will walk you through it.

---

## Coordinating with Steven

To avoid working on the same thing at the same time:

- **Text or message Steven before starting** on anything significant: *"I'm going to work on the registration form today"*
- **Push your changes when you're done** for the day — don't leave changes sitting on your computer overnight
- **Pull first thing** every time you sit down — this keeps you in sync

If you're both making small, unrelated changes (different pages, different features), you can usually work simultaneously without issues. Conflicts only happen when you touch the same file at the same time.

---

## Quick Reference Card

| What you want to do | Command |
|---------------------|---------|
| Navigate to project | `cd ~\rooted-ems` |
| Get latest changes | `git pull` |
| Open Claude Code | Click the Claude icon in taskbar |
| Start the app | `pnpm turbo run dev --filter=web` |
| See what's changed | `git status` |
| Stage changes | `git add -A` |
| Save changes with label | `git commit -m "your description"` |
| Share changes with Steven | `git push` |
| Undo all unsaved changes | `git checkout .` |

---

## Starter Prompts for Claude Code

Use these to get oriented when you open a new Claude Code session:

- *"What are the most recent changes that were made to this codebase?"*
- *"Show me what the family registration flow looks like from start to finish."*
- *"I want to make a change to [page name]. Where is that in the code?"*
- *"Can you walk me through how [specific feature] works before I make any changes?"*

---

## Still Stuck?

Reach out to Steven. For anything technical, you can also paste your question directly into Claude Code — it knows the full codebase and can usually answer in seconds.
