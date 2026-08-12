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
  getGradesForCampuses,
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
  getUpcomingDeadlines,
  getNextUpcomingWindowOpen,
  type UpcomingDeadline,
  type NextWindowOpen,
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
  getRegistrationSummary,
  type RegistrationSummary,
  getFamilyDocuments,
  getFamilyMessages,
  getUnreadNotificationCount,
  type NotificationContext,
  getFamilyOfferDetail,
  getFamilyPendingOffers,
  getLotteryOutcome,
  getWaitlistHistory,
  getExistingHouseholdForUser,
  type FamilyNotification,
  type EnrollmentWindowInfo,
  type FamilyAppSummary,
  type FamilyJourneyCard,
  type FamilyDocumentRow,
  type FamilyMessageRow,
  type FamilyOfferDetail,
  type FamilyPendingOffer,
  type LotteryOutcome,
  type WaitlistStanding,
  type WaitlistHistoryEntry,
  type ExistingHouseholdInfo,
} from "./family";

// Lottery policy governance queries
export {
  getAdoptedPolicyForCampus,
  getPolicyVersionsForCampus,
  getRunGovernance,
  getRunGovernanceBatch,
  getLotteryNotificationProgress,
  getRehearsalReportEntrants,
  isMissingRelation,
  type RehearsalEntrant,
  type LotteryPolicyRow,
  type AdoptedPolicy,
  type RunGovernance,
  type RunGovernanceSummary,
  type LotteryNotificationProgress,
} from "./lottery-policy";

// Staff management queries (lottery, offers, waitlist, enrollment, comms, settings)
export {
  getStaffPendingDocuments,
  getStaffLotteryRuns,
  getStaffLotteryDetail,
  getStaffLotteryReport,
  getStaffOffers,
  getStaffWaitlist,
  getStaffEnrollments,
  getRegistrationPacketForApplication,
  getStaffCommunications,
  getStaffMessageTemplates,
  getNotificationRecipients,
  getInboundEmails,
  getStaffEnrollmentWindows,
  getStaffUsers,
  getStaffStudents,
  getStaffWorkQueue,
  getStaffPacketRequirements,
  getExpiringOffers,
  getStalledRegistrations,
  getReleasableSeats,
  getDuplicateSuspects,
  getPipelineStageCounts,
  getPipelineNeeds,
  type PipelineRowNeed,
  type LotteryRunRow,
  type MessageTemplateRow,
  type LotteryRunDetail,
  type LotteryEntrant,
  type LotteryReportRun,
  type LotteryReportEntrant,
  type OfferRow,
  type OfferStats,
  type WaitlistEntry,
  type WaitlistCampusCount,
  type EnrollmentRow,
  type EnrollmentStats,
  type CommunicationRow,
  type CommunicationStats,
  type InboundEmailRow,
  type EnrollmentWindowRow,
  type StaffUserRow,
  type StudentRow,
  type WorkQueueItem,
  type PacketRequirementRow,
  type PendingDocumentRow,
  type DocumentQueueStats,
  type RegistrationPacketDetail,
  type RegistrationItemRow,
  type ExpiringOfferRow,
  type StalledRegistrationRow,
  type StalledRegistrationsResult,
  type ReleasableSeatGroup,
  type DuplicateSuspectRow,
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
  getJourneyStats,
  getLeaderStripStats,
  type LeadRow,
  type LeadDetail,
  type LeadActivityRow,
  type LeadPipelineSummary,
  type CampaignRow,
  type JourneyStat,
  type LeaderStripStats,
} from "./leads";

// Events + RSVP
export {
  getStaffEvents,
  getEventDetail,
  getUpcomingPublicEvents,
  getPublicEvent,
  getNextUpcomingEvent,
  type EventRow,
  type EventDetail,
  type RsvpRow,
  type PublicEvent,
  type NextEventRow,
} from "./events";

// Recruitment funnel analytics
export {
  getRecruitmentFunnel,
  type RecruitmentFunnel,
  type FunnelStage,
  type SourceRow,
} from "./recruitment-analytics";

// Refusal tracking (playbook s15)
export {
  getDeclineReasonBreakdown,
  RATE_SUPPRESSION_THRESHOLD,
  type DeclineReasonBreakdown,
  type DeclineReasonRow,
} from "./decline-reasons";

// Shared utilities
export { formatRelativeTime } from "./utils";
