/**
 * Centralized data access layer.
 * All Supabase queries are organized into domain-specific modules.
 */

// Application queries (staff + family)
export {
  getStaffApplications,
  getApplicationStats,
  buildPipeline,
  getApplicationDetail,
  getDraftApplicationForEdit,
  getFamilyApplications,
  type ApplicationRow,
  type ApplicationDetail,
  type ApplicationStats,
  type PipelineStage,
  type DocumentRow,
  type TimelineEntry,
  type NoteRow,
  type DraftApplicationData,
} from "./applications";

// Staff dashboard queries
export {
  getStaffDashboardStats,
  getRecentActivity,
  getUpcomingDeadlines,
  type DashboardStats,
  type RecentActivityItem,
  type UpcomingDeadline,
} from "./dashboard";

// Campus queries
export {
  getCampuses,
  getCampusById,
  type CampusRow,
} from "./campuses";

// Family-specific queries
export {
  getFamilyNotifications,
  getActiveEnrollmentWindows,
  getFamilyDashboardApps,
  getFamilyDocuments,
  getFamilyMessages,
  type FamilyNotification,
  type EnrollmentWindowInfo,
  type FamilyAppSummary,
  type FamilyDocumentRow,
  type FamilyMessageRow,
} from "./family";

// Staff management queries (lottery, offers, waitlist, enrollment, comms, settings)
export {
  getStaffLotteryRuns,
  getStaffOffers,
  getStaffWaitlist,
  getStaffEnrollments,
  getStaffCommunications,
  getStaffEnrollmentWindows,
  getStaffUsers,
  type LotteryRunRow,
  type OfferRow,
  type OfferStats,
  type WaitlistEntry,
  type WaitlistCampusCount,
  type EnrollmentRow,
  type EnrollmentStats,
  type CommunicationRow,
  type CommunicationStats,
  type EnrollmentWindowRow,
  type StaffUserRow,
} from "./staff";

// Shared utilities
export { formatRelativeTime } from "./utils";
