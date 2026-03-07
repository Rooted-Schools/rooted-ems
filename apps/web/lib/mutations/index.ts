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
  staffCreateApplication,
  staffFastTrackEnroll,
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

// Offer mutations
export {
  sendOffer,
  acceptOffer,
  declineOffer,
  revokeOffer,
  expireOffer,
  type SendOfferInput,
} from "./offers";

// Waitlist mutations
export {
  addToWaitlist,
  promoteFromWaitlist,
  removeFromWaitlist,
  ensureWaitlist,
  type AddToWaitlistInput,
} from "./waitlist";

// Lottery mutations
export {
  createLotteryRun,
  runLotteryPreview,
  finalizeLotteryRun,
  archiveLotteryRun,
  sendOffersFromLottery,
  type CreateLotteryRunInput,
} from "./lottery";

// Enrollment mutations
export {
  createEnrollment,
  withdrawEnrollment,
  syncEnrollmentSIS,
  transferEnrollment,
  type CreateEnrollmentInput,
} from "./enrollment";

// Registration mutations
export {
  initializeRegistrationPacket,
  completeRegistrationItem,
  submitRegistrationPacket,
  verifyRegistrationItem,
  type InitializePacketInput,
  type CompleteRegistrationItemInput,
} from "./registration";

// Settings mutations
export {
  createEnrollmentWindow,
  updateEnrollmentWindowStatus,
  assignStaffRole,
  removeStaffRole,
  updatePacketRequirement,
  bulkUpdatePacketRequirements,
  type CreateEnrollmentWindowInput,
  type AssignStaffRoleInput,
} from "./settings";

// Communication mutations
export {
  sendNotification,
  createMessageTemplate,
  updateMessageTemplate,
  deleteMessageTemplate,
  type SendNotificationInput,
  type CreateTemplateInput,
  type UpdateTemplateInput,
} from "./communications";
