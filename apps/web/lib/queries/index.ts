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
  getFamilyApplications,
  type ApplicationRow,
  type ApplicationDetail,
  type ApplicationStats,
  type PipelineStage,
  type DocumentRow,
  type TimelineEntry,
  type NoteRow,
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
  type FamilyNotification,
  type EnrollmentWindowInfo,
  type FamilyAppSummary,
} from "./family";

// Shared utilities
export { formatRelativeTime } from "./utils";
