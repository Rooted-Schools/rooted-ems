# Getting Started with Rooted EMS
### A Step-by-Step Setup Guide

Welcome! This guide will walk you through everything you need to get set up — no technical experience required. Follow each step in order and don't skip ahead.

**Estimated time: 30–45 minutes**

If anything goes wrong, text or email Steven and he'll help you through it.

---

## Before You Begin

You'll need:
- A Mac or Windows computer
- An internet connection
- The `.env.local` file from Steven (he'll send this to you separately — wait until Step 9 to use it)

---

## Step 1: Create a GitHub Account

GitHub is the website where the project's code is stored. You need a free account to access it.

1. Go to **[github.com](https://github.com)** in your web browser
2. Click the green **"Sign up"** button in the top right corner
3. Enter your email address, create a password, and choose a username
   > Your username can be anything — something simple like your first name is fine
4. Follow the prompts to verify your email and finish creating your account
5. Once you're signed in, **find your username** — it appears in the top right corner of the page under your profile picture

**Send Steven your GitHub username** so he can give you access to the project. He'll invite you by email.

---

## Step 2: Accept the GitHub Invitation

After Steven adds you, GitHub will send you an invitation email.

1. Check your email inbox for a message from **noreply@github.com** with the subject line **"You've been invited to collaborate"**
   > Check your spam folder if you don't see it within a few minutes
2. Open the email and click the green **"Accept invitation"** button
3. You'll be taken to GitHub and see a confirmation that you now have access

---

## Step 3: Open Terminal

Terminal is a built-in app on your computer that lets you type commands. You'll use it throughout this setup.

**On a Mac:**
1. Press **⌘ Space** (Command + Spacebar) to open Spotlight Search
2. Type **Terminal** and press **Enter**
3. A window will open with a blinking cursor — that's Terminal

**On Windows:**
1. Press the **Windows key**, type **PowerShell**, and press **Enter**
2. A blue window will open with a blinking cursor — that's your Terminal

> **What is a "command"?** When this guide says "run" something, it means: click inside the Terminal window, type exactly what's shown, and press **Enter**. The computer will do the rest.

---

## Step 4: Install Node.js

Node.js is a tool that the project needs to run. Let's check if you already have it.

1. In Terminal, type the following and press **Enter**:
   ```
   node --version
   ```

2. **If you see something like `v20.11.0`** — you already have it! Skip to Step 5.

3. **If you see `command not found`** — you need to install it:
   - Go to **[nodejs.org](https://nodejs.org)**
   - Click the big button that says **"LTS"** (recommended for most users)
   - Open the downloaded file and follow the installer — click Continue, Agree, and Install
   - Once installed, **close Terminal completely** and reopen it (Step 3 again)
   - Run `node --version` again — you should now see a version number

---

## Step 5: Install pnpm

pnpm is a tool that downloads and manages the project's dependencies (the extra code the project relies on).

1. In Terminal, run:
   ```
   npm install -g pnpm
   ```
   > This will take about 30 seconds. You'll see some text scroll by — that's normal.

2. When it finishes, verify it worked by running:
   ```
   pnpm --version
   ```
   You should see a version number like `9.0.0`. If you do, you're good to go.

   > **If you get a "permission denied" error on Mac**, run this instead:
   > ```
   > sudo npm install -g pnpm
   > ```
   > It will ask for your Mac login password. Type it and press Enter (you won't see the letters as you type — that's normal).

---

## Step 6: Install Git

Git is a tool that downloads code from GitHub to your computer.

1. In Terminal, run:
   ```
   git --version
   ```

2. **If you see something like `git version 2.39.0`** — you already have it! Skip to Step 7.

3. **If you're on a Mac and see a pop-up** asking to install developer tools — click **Install** and wait for it to finish, then run `git --version` again.

4. **If you're on Windows and see `command not found`** — go to **[git-scm.com/download/win](https://git-scm.com/download/win)**, download the installer, and follow the steps (click Next through all the defaults).

---

## Step 7: Install Claude Code

Claude Code is the AI assistant you'll use to explore and work in the project.

1. Go to **[claude.ai/download](https://claude.ai/download)**
2. Click the download button for your operating system (Mac or Windows)
3. Open the downloaded file and follow the installer instructions
4. When the installation finishes, **close Terminal and reopen it** (Step 3 again)
5. Verify Claude Code installed by running:
   ```
   claude --version
   ```
   You should see a version number. If so, Claude Code is ready.

6. Claude Code will ask you to log in — go to **[claude.ai](https://claude.ai)**, create a free account if you don't have one, and sign in.

---

## Step 8: Download the Project (Clone the Repository)

Now you'll download the actual project code to your computer.

1. In Terminal, run this command to navigate to your home folder:
   ```
   cd ~
   ```

2. Now run this command to download the project:
   ```
   git clone https://github.com/carnster/rooted-ems.git
   ```
   > You'll see text scrolling by as it downloads — this takes about 30–60 seconds depending on your internet speed.

3. When it finishes, navigate into the project folder:
   ```
   cd rooted-ems
   ```
   > **How to know it worked:** Your Terminal prompt will now show `rooted-ems` at the end of the line.

4. Now install the project's dependencies:
   ```
   pnpm install
   ```
   > This downloads additional code the project needs. It will take 1–3 minutes. You'll see a lot of text — that's normal. Wait until you see your cursor blinking again before moving on.

---

## Step 9: Add the Database Credentials File

Steven will send you a file called `.env.local`. This file contains the passwords and keys needed to connect to the database. **Keep this file private — do not share it or post it anywhere.**

### Where it needs to go

The file must be placed inside a specific folder on your computer:

```
rooted-ems  ← the project folder you downloaded
└── apps
    └── web
        └── .env.local   ← the file goes HERE
```

### How to place it there

**Step 9a — Find the destination folder in Finder (Mac) or File Explorer (Windows):**

*On Mac:*
1. Open **Finder**
2. In the menu bar at the top of your screen, click **Go → Home**
3. You'll see a folder called `rooted-ems` — double-click to open it
4. Open the `apps` folder inside it
5. Open the `web` folder inside that
6. Press **⌘ Shift .** (Command + Shift + Period) to show hidden files
   > The `.env.local` file starts with a dot, which makes it invisible by default. This shortcut reveals it.

*On Windows:*
1. Open **File Explorer**
2. In the address bar, type `%USERPROFILE%\rooted-ems\apps\web` and press Enter

**Step 9b — Move the `.env.local` file into that folder:**

1. Find the `.env.local` file Steven sent you (likely in your **Downloads** folder)
2. Drag and drop it into the `web` folder you opened above

**Step 9c — Verify it worked:**

Back in Terminal, run:
```
ls ~/rooted-ems/apps/web/.env.local
```
If it prints back the file path, you're good. If it says "No such file or directory," the file is in the wrong place — go back to Step 9b.

---

## Step 10: Open Claude Code in the Project

Now you'll open Claude Code inside the project folder.

1. In Terminal, make sure you're in the `rooted-ems` folder. Run:
   ```
   cd ~/rooted-ems
   ```

2. Open Claude Code:
   ```
   claude
   ```

3. Claude Code will start up and read the project automatically. **You're in!**

You'll see a chat interface. Claude Code already knows the full codebase — just start asking it questions.

---

## Step 11 (Optional): See the App in Your Browser

If you want to see the actual enrollment app running on your computer:

1. In Terminal, run:
   ```
   pnpm turbo run dev --filter=web
   ```
   > Wait until you see a message saying something like `ready on http://localhost:3000`

2. Open your web browser and go to:
   - **Family portal:** `http://localhost:3000/login`
   - **Staff portal:** `http://localhost:3000/staff-login`

3. To stop the app when you're done, go back to Terminal and press **⌃ C** (Control + C).

---

## You're All Set!

Here are some starter prompts to try in Claude Code once you're in:

- *"Give me a tour of this project — what does it do and how is it organized?"*
- *"Walk me through what a family experiences when they apply to a school."*
- *"Show me how the staff reviews applications."*
- *"What has been built so far and what's still in progress?"*

---

## Troubleshooting

| Problem | What to do |
|---------|------------|
| `command not found: node` | Go back to Step 4 and install Node.js |
| `command not found: pnpm` | Go back to Step 5 and install pnpm |
| `command not found: git` | Go back to Step 6 and install Git |
| `command not found: claude` | Go back to Step 7 and install Claude Code. Make sure to close and reopen Terminal after installing. |
| GitHub clone fails with "access denied" | Make sure you accepted the GitHub invitation in Step 2 |
| `.env.local` not working | Make sure the file is inside `apps/web/` — not the `rooted-ems` root folder |
| `pnpm install` permission error on Mac | Add `sudo` before the command and enter your Mac password |
| App doesn't load in browser | Make sure the Terminal command from Step 11 is still running |

Still stuck? Reach out to Steven — he can jump on a quick call to help.
