// Plain module — deliberately NOT "use server". Next.js requires every export
// of a "use server" file to be an async server action, so the feedback
// category list and its type cannot live in actions.ts: when the client
// component imported them from that "use server" file, it corrupted the
// server-action wiring for the whole module and submitPilotFeedback failed to
// dispatch (uncaught throw -> "Something went wrong", never a saved row). This
// is the same reason lib/search-utils.ts keeps its pure helpers separate.
export const FEEDBACK_CATEGORIES = ["Bug", "Confusing", "Idea", "Working well"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
