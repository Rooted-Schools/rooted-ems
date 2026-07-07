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
  getFamilyJourneyCards,
  getFamilyDocuments,
  getFamilyMessages,
  getFamilyOfferDetail,
  getFamilyPendingOffers,
  type FamilyNotification,
  type EnrollmentWindowInfo,
  type FamilyAppSummary,
  type FamilyJourneyCard,
  type FamilyDocumentRow,
  type FamilyMessageRow,
  type FamilyOfferDetail,
  type FamilyPendingOffer,
} from "./family";

// Staff management queries (lottery, offers, waitlist, enrollment, comms, settings)
export {
  getStaffPendingDocuments,
  getStaffLotteryRuns,
  getStaffLotteryDetail,
  getStaffOffers,
  getStaffWaitlist,
  getStaffEnrollments,
  getRegistrationPacketForApplication,
  getStaffCommunications,
  getStaffMessageTemplates,
  getNotificationRecipients,
  getStaffEnrollmentWindows,
  getStaffUsers,
  getStaffStudents,
  getStaffWorkQueue,
  getStaffPacketRequirements,
  type LotteryRunRow,
  type MessageTemplateRow,
  type LotteryRunDetail,
  type LotteryEntrant,
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
  type StudentRow,
  type WorkQueueItem,
  type PacketRequirementRow,
  type PendingDocumentRow,
  type DocumentQueueStats,
  type RegistrationPacketDetail,
  type RegistrationItemRow,
} from "./staff";

// Demographic / equity queries
export {
  getDemographicBreakdowns,
  type DemographicBreakdowns,
  type DemographicSummary,
  type SubgroupFunnelRow,
  type GradeDistributionRow,
  type CampusBreakdownRow,
  type RaceEthnicityRow,
} from "./demographics";

// Lead (CRM) queries
export {
  getLeads,
  getFollowUpQueue,
  getLeadPipelineSummary,
  getLeadDetail,
  getCampaigns,
  type LeadRow,
  type LeadDetail,
  type LeadActivityRow,
  type LeadPipelineSummary,
  type CampaignRow,
} from "./leads";

// Events + RSVP
export {
  getStaffEvents,
  getEventDetail,
  getUpcomingPublicEvents,
  getPublicEvent,
  type EventRow,
  type EventDetail,
  type RsvpRow,
  type PublicEvent,
} from "./events";

// Recruitment funnel analytics
export {
  getRecruitmentFunnel,
  type RecruitmentFunnel,
  type FunnelStage,
  type SourceRow,
} from "./recruitment-analytics";

// Shared utilities
export { formatRelativeTime } from "./utils";
