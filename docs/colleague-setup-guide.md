# Getting Started with Rooted EMS
### A Complete Step-by-Step Setup Guide

Welcome! This guide walks you through everything you need — no technical experience required. Every single step is spelled out. Follow them in order and don't skip ahead.

**Estimated time: 30–45 minutes**

If anything goes wrong at any point, stop and reach out to Steven. He can jump on a quick call and walk you through it.

---

## Before You Begin

You will need:
- A Mac or Windows computer
- A stable internet connection
- The `.env.local` file from Steven — he'll send this to you separately. **Don't use it until Step 9.**

---

## Step 1: Create a GitHub Account

GitHub is the website that stores the project code. You need a free account to access it.

1. Open your web browser (Chrome, Safari, Edge — any of them)
2. In the address bar at the top, type **github.com** and press **Enter**
3. You'll land on the GitHub homepage. Click the green **"Sign up"** button in the top right corner of the page
4. GitHub will walk you through creating an account:
   - Enter your **email address** and click Continue
   - Create a **password** (at least 8 characters) and click Continue
   - Choose a **username** — this can be anything, like your first name or first name + last initial (example: `juliesmith` or `jsmith`)
   - Click Continue
5. GitHub will send a **verification code** to your email. Go check your inbox, copy the code, and paste it back on the GitHub page
6. Follow any remaining prompts until you see your GitHub dashboard (a page that says "Welcome to GitHub")
7. **Find your username:** Look at the top right corner of the page — click your profile picture and your username will appear in the dropdown

**→ Send Steven your GitHub username now.** He needs it to invite you to the project. You can text it or email it to him.

---

## Step 2: Accept Steven's GitHub Invitation

After Steven adds you, you'll receive an invitation by email.

1. Open your email inbox and look for a message from **noreply@github.com**
   - The subject line will say something like: **"Rooted-schools invited you to collaborate"**
   - > If you don't see it after a few minutes, check your **Spam** or **Junk** folder
2. Open the email
3. Click the green **"View invitation"** or **"Accept invitation"** button inside the email
4. Your browser will open GitHub and show a confirmation page — click **Accept invitation** one more time if prompted
5. You'll see a message that you now have access to the `rooted-ems` repository

---

## Step 3: Open Your Command Window

Throughout this guide, you'll need to type instructions directly into your computer using a special text window. This is normal — you're just giving your computer instructions by typing instead of clicking.

**On a Mac, this window is called Terminal.**
**On Windows, this window is called PowerShell.**

They do the same thing. PowerShell is not something you download — it comes built into every Windows computer. It looks like a plain blue or black window with white text. You type a command, press Enter, and the computer does what you asked.

> **What does "run a command" mean?**
> When this guide says to "run" something, it means:
> 1. Click inside the window so it's active (the cursor should be blinking)
> 2. Type exactly what's shown — or copy and paste it
> 3. Press **Enter**
> The computer runs the instruction and shows you the result. Then it waits for the next one.

---

### On a Mac — How to open Terminal:

1. Press **⌘ Space** (hold the Command key and tap Spacebar) — a search bar appears in the middle of your screen
2. Type **Terminal** and press **Enter**
3. A window opens with some text and a blinking cursor — that's Terminal. Leave it open.

---

### On Windows — How to open PowerShell:

1. Press the **Windows key** on your keyboard — it has the Windows logo on it, usually in the bottom-left corner of your keyboard
2. A search bar appears. Type **PowerShell**
3. Click **Windows PowerShell** in the results (not PowerShell 7 or ISE — just plain Windows PowerShell)
4. A blue window opens with white text and a blinking cursor — that's PowerShell. Leave it open.

> ⚠️ **Windows users:** Every time this guide says "Terminal," it means PowerShell. They work exactly the same way for everything in this guide.

---

## Step 4: Check if Node.js is Installed

Node.js is a tool the project needs to run. Let's see if you already have it.

1. In Terminal, type this exactly and press **Enter**:
   ```
   node --version
   ```

2. Look at what appears:
   - **If you see something like `v20.11.0` or `v18.x.x`** — great, you have it! Move on to Step 5.
   - **If you see `command not found` or `node is not recognized`** — you need to install it. Continue with the steps below.

### Installing Node.js (only if needed):

1. Open your web browser and go to **[nodejs.org](https://nodejs.org)**
2. You'll see two big download buttons. Click the one that says **"LTS"** — that stands for Long Term Support and is the recommended version
3. A file will download to your computer (it will be in your Downloads folder)
4. Open the downloaded file:
   - **Mac:** Double-click the `.pkg` file. Click Continue → Continue → Agree → Continue → Install. Enter your Mac password if asked. Click Install Software. Click Close when done.
   - **Windows:** Double-click the `.msi` file. Click Next → check "I accept" → Next → Next → Next → Install. Click Yes if a security popup appears. Click Finish when done.
5. **Important:** After installation, completely close Terminal and reopen it (go back to Step 3)
6. Once Terminal is open again, run `node --version` — you should now see a version number

---

## Step 5: Install pnpm

pnpm is a tool that downloads everything else the project needs to run.

1. In Terminal, type this exactly and press **Enter**:
   ```
   npm install -g pnpm
   ```
2. You'll see several lines of text appear — that's normal. Wait until the blinking cursor comes back (about 30 seconds)

3. Verify it worked by running:
   ```
   pnpm --version
   ```
   You should see a number like `9.0.0` or similar. If you do, move on to Step 6.

---

### If you get a "permission denied" error on Mac:

1. Run this version of the command instead:
   ```
   sudo npm install -g pnpm
   ```
2. Terminal will ask: `Password:`
3. Type your **Mac login password** and press **Enter**
   > You won't see any letters appear as you type — that's normal, it's hidden for security
4. The installation will proceed. Run `pnpm --version` to confirm it worked.

---

### If you get an error on Windows:

1. Close PowerShell
2. Press the **Windows key**, type **PowerShell**, then right-click on **Windows PowerShell** and click **"Run as administrator"**
3. Click **Yes** if a security popup appears
4. Run the install command again:
   ```
   npm install -g pnpm
   ```

---

## Step 6: Check if Git is Installed

Git is the tool that downloads the project code from GitHub to your computer.

1. In Terminal, run:
   ```
   git --version
   ```

2. Look at what appears:
   - **If you see something like `git version 2.39.0`** — you already have it! Skip to Step 7.
   - **Mac — if a popup appears** saying "The Xcode Command Line Tools are required" → click **Install** and wait for it to finish (5–10 minutes). Then run `git --version` again.
   - **Windows — if you see `command not found`** → follow the install steps below.

### Installing Git on Windows (only if needed):

1. Open your browser and go to **[git-scm.com/download/win](https://git-scm.com/download/win)**
2. The download should start automatically. If not, click the download link on the page.
3. Open the downloaded file
4. Click **Next** through every screen — the default settings are all correct. Don't change anything.
5. Click **Install**, then **Finish** when done
6. Close PowerShell and reopen it (Step 3), then run `git --version` to confirm

---

## Step 7: Install Claude Code

Claude Code is the AI assistant you'll use to explore and contribute to the project.

---

### On Mac:

1. Open your browser and go to **[claude.ai/download](https://claude.ai/download)**
2. Click the download button for Mac
3. Open the downloaded `.dmg` file
4. Drag the Claude icon into your Applications folder when the window appears
5. Open your Applications folder and double-click **Claude** to launch it
6. Sign in with your Claude account when prompted. If you don't have one, go to **[claude.ai](https://claude.ai)** and create a free account first.
7. Close Terminal completely and reopen it (go back to Step 3)
8. Verify it worked:
   ```
   claude --version
   ```
   You should see a version number like `1.x.x`. If so, you're ready to move on.

---

### On Windows (Claude Code Desktop App):

1. Open your browser and go to **[claude.ai/download](https://claude.ai/download)**
2. Click the **Windows** download button
3. Open the downloaded installer file
4. Click **Yes** if a security popup appears
5. Follow the prompts — click **Next**, then **Install**, then **Finish**
6. Claude Code will appear in your Start menu and on your taskbar
7. Open it by clicking the **Claude** icon
8. Sign in with your Claude account when prompted. If you don't have one, go to **[claude.ai](https://claude.ai)** and create a free account first.

That's it — no extra commands needed. Claude Code Desktop is ready to use.

---

## Step 8: Download the Project

Now you'll download the actual project code to your computer. This is called "cloning."

### On Mac:

1. In Terminal, run this to make sure you're starting from your home folder:
   ```
   cd ~
   ```
   > You won't see anything happen — that's normal. It just navigates to the right place.

2. Run this to download the project:
   ```
   git clone https://github.com/Rooted-schools/rooted-ems.git
   ```
   > Lines of text will scroll by as it downloads. This takes about 30–60 seconds. Wait until the cursor is blinking again.

3. Navigate into the project folder:
   ```
   cd rooted-ems
   ```
   > **How to know it worked:** The text at the beginning of your Terminal line should now end with `rooted-ems`

4. Install the project's dependencies:
   ```
   pnpm install
   ```
   > This takes 1–3 minutes. A lot of text will scroll by — that's normal. Wait until the blinking cursor comes back before moving on.

---

### On Windows:

1. In PowerShell, run this to start from your home folder:
   ```
   cd ~
   ```

2. Run this to download the project:
   ```
   git clone https://github.com/Rooted-schools/rooted-ems.git
   ```
   > Lines of text will scroll by. Wait for the blinking cursor to return.

3. Navigate into the project folder:
   ```
   cd rooted-ems
   ```

4. Install the project's dependencies:
   ```
   pnpm install
   ```
   > This takes 1–3 minutes. Wait until the blinking cursor returns before moving on.

---

## Step 9: Add the Database Credentials File

Steven will send you a file called `.env.local`. This file contains the private keys that connect the app to its database. **Keep this file private. Do not forward it, post it, or share it anywhere.**

The file needs to be placed in a very specific location inside the project you just downloaded:

```
rooted-ems
└── apps
    └── web
        └── .env.local   ← the file must go exactly here
```

---

### On Mac:

**Step 9a — Locate the Downloads folder where the file landed:**
1. Open **Finder** (click the smiley face icon in your Dock at the bottom of the screen)
2. In the left sidebar, click **Downloads**
3. You should see the `.env.local` file there
   > If you don't see it, press **⌘ Shift .** (Command + Shift + Period) to reveal hidden files. Files starting with a dot are hidden by default on Mac.

**Step 9b — Navigate to the destination folder:**
1. In the Finder left sidebar, click **Home** (the house icon with your name)
2. Double-click the `rooted-ems` folder
3. Double-click the `apps` folder
4. Double-click the `web` folder
5. Press **⌘ Shift .** to show hidden files here too

**Step 9c — Move the file:**
1. Go back to your Downloads folder (left sidebar → Downloads)
2. Click on `.env.local` once to select it
3. Hold **⌘** (Command) and press **C** to copy it
4. Go back to the `web` folder
5. Hold **⌘** and press **V** to paste it

**Step 9d — Verify it worked:**
1. In Terminal, run:
   ```
   ls ~/rooted-ems/apps/web/.env.local
   ```
2. If it prints the file path back at you — you're done with this step. ✅
3. If it says "No such file or directory" — the file is in the wrong location. Go back to Step 9c.

---

### On Windows:

> ⚠️ **Important Windows note:** Windows does not allow files that start with a dot to be saved normally. When you receive the `.env.local` file, Windows will automatically rename it — stripping the dot — and save it as something like `env.local`, `env.downloaded`, or `env`. You **cannot** fix this in File Explorer. You must use PowerShell to rename and move it. Follow the steps below exactly.

**Step 9a — Find out what Windows named the file:**
1. Open **PowerShell** (Windows key → type PowerShell → press Enter)
2. Navigate to your Downloads folder:
   ```
   cd ~\Downloads
   ```
3. Look for the file by running:
   ```
   dir env*
   ```
4. PowerShell will show you a list. Look for a file whose name starts with `env` — it might be called `env.local`, `env.downloaded`, `env`, or something similar. **Make a note of the exact name.**

**Step 9b — Rename the file:**

Replace `env.downloaded` in the command below with whatever exact filename you saw in Step 9a:
```
Rename-Item env.downloaded .env.local
```
> For example, if the file was named `env.local`, you would type: `Rename-Item env.local .env.local`
> If it was named just `env`, you would type: `Rename-Item env .env.local`

**Step 9c — Move the file to the correct location:**
```
Move-Item .env.local ~\rooted-ems\apps\web\.env.local
```
> This moves the file from your Downloads folder into the correct spot inside the project.

**Step 9d — Verify it worked:**
```
dir ~\rooted-ems\apps\web
```
Look through the list of files that appear. You should see `.env.local` listed. If you see it — you're done with this step. ✅

If you don't see it, text Steven — this is the trickiest part of the setup on Windows and he can walk you through it.

---

## Step 10: Open Claude Code in the Project

Now you'll launch Claude Code inside the project folder.

### On Mac:

1. In Terminal, run:
   ```
   cd ~/rooted-ems
   ```
2. Then run:
   ```
   claude
   ```
3. Claude Code will start up. It will automatically read the project and know everything about the codebase.
4. You'll see a chat-style interface. **You're in!** Just start typing questions.

---

### On Windows:

1. In PowerShell, run:
   ```
   cd ~\rooted-ems
   ```
2. Then run:
   ```
   claude
   ```
3. Claude Code will start up and read the project automatically.
4. You'll see a chat-style interface. **You're in!**

---

## Step 11 (Optional): See the App Running in Your Browser

If you want to open the actual enrollment app in your web browser:

### On Mac:
1. In Terminal, run:
   ```
   pnpm turbo run dev --filter=web
   ```
2. Wait until you see a line that says something like `ready on http://localhost:3000` — this means the app is running
3. Open your web browser and go to:
   - **Family portal:** `http://localhost:3000/login`
   - **Staff portal:** `http://localhost:3000/staff-login`
4. When you're done, go back to Terminal and press **⌘ C** (Command + C) to stop the app

### On Windows:
1. In PowerShell, run:
   ```
   pnpm turbo run dev --filter=web
   ```
2. Wait until you see `ready on http://localhost:3000`
3. Open your browser and go to:
   - **Family portal:** `http://localhost:3000/login`
   - **Staff portal:** `http://localhost:3000/staff-login`
4. When you're done, press **Ctrl + C** in PowerShell to stop the app

---

## You're All Set!

Once Claude Code is open, here are some questions to start with:

- *"Give me a tour of this project — what does it do and how is it organized?"*
- *"Walk me through what a family experiences when they apply to a school."*
- *"Show me how staff review and approve applications."*
- *"What has been built so far and what's still in progress?"*

---

## Troubleshooting

| Problem | What to do |
|---------|------------|
| `command not found: node` | Go back to Step 4 and install Node.js |
| `command not found: pnpm` | Go back to Step 5 and install pnpm |
| `command not found: git` | Go back to Step 6 and install Git |
| `command not found: claude` | Go back to Step 7 and reinstall Claude Code. Close and reopen Terminal after installing. |
| GitHub clone says "access denied" | Make sure you accepted the GitHub invite in Step 2 and that Steven has added you |
| `.env.local` not working | Make sure the file is inside the `apps/web` folder — not the main `rooted-ems` folder |
| Windows saved file as `env.downloaded` or `env.local` | Follow Step 9 (Windows) exactly — use PowerShell to rename it before moving it |
| `pnpm install` says "permission denied" on Mac | Re-run with `sudo` in front and enter your Mac password |
| App doesn't open in browser | Make sure the Terminal command from Step 11 is still running — don't close that window |
| Any other error | Text or email Steven — he can jump on a quick call |
