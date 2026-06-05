Subject: Access to Rooted EMS — Setup Instructions

---

Hey [Name],

Excited to get you set up on the Rooted EMS project! I'm sharing access to the codebase so you can explore it, make contributions, and work with Claude Code alongside me.

Before you dive in, a couple of things I need to send/do on my end:

1. **GitHub invite** — I'll add you as a collaborator on the repo. You'll get an email from GitHub — just accept the invite and you're in.
2. **Database credentials** — I'll send the `.env.local` file separately. It contains credentials for the database, so keep it private.

Once you have both of those, here's the setup in a nutshell:

1. Install [Claude Code](https://claude.ai/download) and sign in with your Claude account
2. Make sure you have Node.js and pnpm installed (instructions in the full guide below)
3. Clone the repo: `git clone https://github.com/carnster/rooted-ems.git`
4. Run `pnpm install` inside the folder
5. Drop the `.env.local` file I send you into `apps/web/`
6. Run `claude` from the project folder — and you're in

The project has a built-in context file (`CLAUDE.md`) that orients Claude Code to the codebase automatically, so you won't need to explain the project to it — just start asking questions.

I've attached a full step-by-step guide with screenshots, troubleshooting tips, and starter prompts for getting oriented once you're in.

Let me know when you're set up or if you hit any snags — happy to jump on a quick call to walk through it.

Steven
