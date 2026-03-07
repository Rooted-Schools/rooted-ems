/**
 * Centralized mutation layer.
 * All Supabase write operations organized by domain.
 */

// Application mutations
export {
  createApplication,
  updateApplication,
  submitApplication,
  withdrawApplication,
  updateApplicationStatus,
  type MutationResult,
  type CreateApplicationInput,
  type UpdateApplicationInput,
} from "./applications";

// Document mutations
export {
  reviewDocument,
  createDocumentRecord,
} from "./documents";

// Verification mutations
export {
  createVerificationChecklist,
  toggleVerificationItem,
  getVerificationChecklist,
  type VerificationItemRow,
} from "./verification";

// Note mutations
export {
  createNote,
  updateNote,
  deleteNote,
} from "./notes";
