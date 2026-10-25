import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import ProtectedRoute from "@/components/ProtectedRoute";
import { Toaster } from "@/components/ui/toaster";
import Auth from "@/pages/Auth";
import StudioLayout from "@/pages/StudioLayout";
import HomePage from "@/pages/HomePage";
import NotFoundPage from "@/pages/NotFoundPage";
import HubGate from "@/components/hub/HubGate";
import PublicRoadmap from "@/pages/PublicRoadmap";

// Every page inside the studio layout except Home is route-level lazy(), so
// the reference data they import (inspiration, advisors, top posts: ~400 KB)
// stays out of the main bundle. Auth, Home, the 404 page, the Hub gate and the
// public roadmap stay eager: they render outside the layout's Suspense or are
// the landing page. Avoid the manualChunks object form, which force-preloads
// lazy chunks.
const WelcomePage = lazy(() => import("@/pages/WelcomePage"));
const CoachPage = lazy(() => import("@/pages/CoachPage"));
const PlaybookPage = lazy(() => import("@/pages/PlaybookPage"));
const CalendarPage = lazy(() => import("@/pages/CalendarPage"));
const AnalyticsPage = lazy(() => import("@/pages/AnalyticsPage"));
const PlanPage = lazy(() => import("@/pages/PlanPage"));
const VoicePage = lazy(() => import("@/pages/VoicePage"));
const BrandPage = lazy(() => import("@/pages/BrandPage"));
const MediaPage = lazy(() => import("@/pages/MediaPage"));
const ConnectPage = lazy(() => import("@/pages/ConnectPage"));
const AccountsPage = lazy(() => import("@/pages/AccountsPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const GridPage = lazy(() => import("@/pages/GridPage"));
const DraftsPage = lazy(() => import("@/pages/DraftsPage"));
const LibraryPage = lazy(() => import("@/pages/LibraryPage"));
const BoardPage = lazy(() => import("@/pages/BoardPage"));
const GeneratePage = lazy(() => import("@/pages/GeneratePage"));
const BatchPage = lazy(() => import("@/pages/BatchPage"));
const CarouselPage = lazy(() => import("@/pages/CarouselPage"));
const ImagePage = lazy(() => import("@/pages/ImagePage"));
const SlideshowPage = lazy(() => import("@/pages/SlideshowPage"));
const MakePage = lazy(() => import("@/pages/MakePage"));
const MakeFormatPage = lazy(() => import("@/pages/MakeFormatPage"));
const SwipeFilePage = lazy(() => import("@/pages/SwipeFilePage"));
const TrendsPage = lazy(() => import("@/pages/TrendsPage"));
const CloneReelPage = lazy(() => import("@/pages/CloneReelPage"));
const InspirationPage = lazy(() => import("@/pages/InspirationPage"));
const FollowingPage = lazy(() => import("@/pages/FollowingPage"));
const CompetitorsPage = lazy(() => import("@/pages/CompetitorsPage"));
const PeoplePage = lazy(() => import("@/pages/PeoplePage"));
const SavedPage = lazy(() => import("@/pages/SavedPage"));
const MarketPage = lazy(() => import("@/pages/MarketPage"));
const NorthStarPage = lazy(() => import("@/pages/NorthStarPage"));
const InspirationDetailPage = lazy(() => import("@/pages/InspirationDetailPage"));
const ProfilesPage = lazy(() => import("@/pages/ProfilesPage"));
const ProfileDetailPage = lazy(() => import("@/pages/ProfileDetailPage"));
const AcademyPage = lazy(() => import("@/pages/AcademyPage"));
const TutorialPage = lazy(() => import("@/pages/TutorialPage"));
const FeedbackPage = lazy(() => import("@/pages/FeedbackPage"));
const CreateGuidePage = lazy(() => import("@/pages/CreateGuidePage"));
const TeamPage = lazy(() => import("@/pages/TeamPage"));
const HubHomePage = lazy(() => import("@/pages/hub/HubHomePage"));
const HubTrendsPage = lazy(() => import("@/pages/hub/HubTrendsPage"));
const HubGuidesPage = lazy(() => import("@/pages/hub/HubGuidesPage"));
const HubGuideDetailPage = lazy(() => import("@/pages/hub/HubGuideDetailPage"));
const HubAdminPage = lazy(() => import("@/pages/hub/HubAdminPage"));
const FadsPage = lazy(() => import("@/pages/FadsPage"));
const RecruitPage = lazy(() => import("@/pages/RecruitPage"));
const EngagePage = lazy(() => import("@/pages/EngagePage"));
const AutoDmPage = lazy(() => import("@/pages/AutoDmPage"));
const ReelsPage = lazy(() => import("@/pages/ReelsPage"));
const ReelsTeamPage = lazy(() => import("@/pages/ReelsTeamPage"));
const AddBrandPage = lazy(() => import("@/pages/AddBrandPage"));
const VideoEditPage = lazy(() => import("@/pages/VideoEditPage"));
// Public pages (no sign-in), each in its own chunk.
const PreviewReviewPage = lazy(() => import("@/pages/PreviewReviewPage"));
const BioPublicPage = lazy(() => import("@/pages/BioPublicPage"));
const LinkInBioPage = lazy(() => import("@/pages/LinkInBioPage"));
const TrackedReportPublicPage = lazy(() => import("@/pages/TrackedReportPublicPage"));
const JoinPage = lazy(() => import("@/pages/JoinPage"));
const TrackedLinksPage = lazy(() => import("@/pages/TrackedLinksPage"));
// North star phase 5 (Leo only): stubs that answer the not-found page until their builders replace them.
const AudiencesPage = lazy(() => import("@/pages/AudiencesPage"));
const IdeasPage = lazy(() => import("@/pages/IdeasPage"));
const CampaignsPage = lazy(() => import("@/pages/CampaignsPage"));
const CampaignWizardPage = lazy(() => import("@/pages/CampaignWizardPage"));
const CampaignPage = lazy(() => import("@/pages/CampaignPage"));
// North star phase 6 (Leo only): stubs that answer the not-found page until their builders replace them.
const AgentPage = lazy(() => import("@/pages/AgentPage"));
const SkillsPage = lazy(() => import("@/pages/SkillsPage"));
const ActivityPage = lazy(() => import("@/pages/ActivityPage"));
const AutomationsPage = lazy(() => import("@/pages/AutomationsPage"));

export default function App() {
  return (
    <>
      <Routes>
        {/* Public: what people asked for, what is being built, what shipped. */}
        <Route path="/roadmap" element={<PublicRoadmap />} />
        <Route path="/auth" element={<Auth />} />
        <Route
          path="/review/:token"
          element={
            <Suspense fallback={null}>
              <PreviewReviewPage />
            </Suspense>
          }
        />
        <Route
          path="/l/:slug"
          element={
            <Suspense fallback={null}>
              <BioPublicPage />
            </Suspense>
          }
        />
        <Route
          path="/join"
          element={
            <Suspense fallback={null}>
              <JoinPage />
            </Suspense>
          }
        />
        <Route
          path="/t/report/:slug"
          element={
            <Suspense fallback={null}>
              <TrackedReportPublicPage />
            </Suspense>
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <StudioLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/agent" element={<AgentPage />} />
          <Route path="/agent/:thread" element={<AgentPage />} />
          <Route path="/generate" element={<GeneratePage />} />
          <Route path="/generate/batch" element={<BatchPage />} />
          <Route path="/carousel" element={<CarouselPage />} />
          <Route path="/image" element={<ImagePage />} />
          <Route path="/slideshow" element={<SlideshowPage />} />
          <Route path="/make" element={<MakePage />} />
          <Route path="/make/:format" element={<MakeFormatPage />} />
          <Route path="/edit" element={<VideoEditPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/campaigns/new" element={<CampaignWizardPage />} />
          <Route path="/campaigns/:id" element={<CampaignPage />} />
          <Route path="/ideas" element={<IdeasPage />} />
          <Route path="/fads" element={<FadsPage />} />
          <Route path="/fads/:tab" element={<FadsPage />} />
          <Route path="/recruit" element={<RecruitPage />} />
          <Route path="/recruit/engage" element={<EngagePage />} />
          <Route path="/recruit/auto-dm" element={<AutoDmPage />} />
          <Route path="/recruit/:tab" element={<RecruitPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/inspiration" element={<InspirationPage />} />
          <Route path="/following" element={<FollowingPage />} />
          <Route path="/competitors" element={<CompetitorsPage />} />
          <Route path="/saved" element={<SavedPage />} />
          <Route path="/market" element={<MarketPage />} />
          <Route path="/north-star" element={<NorthStarPage />} />
          <Route path="/inspiration/:id" element={<InspirationDetailPage />} />
          <Route path="/profiles" element={<ProfilesPage />} />
          <Route path="/profiles/:id" element={<ProfileDetailPage />} />
          <Route path="/swipe" element={<SwipeFilePage />} />
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="/clone" element={<CloneReelPage />} />
          <Route path="/create-guide" element={<CreateGuidePage />} />
          <Route path="/voice" element={<VoicePage />} />
          <Route path="/brand" element={<BrandPage />} />
          <Route path="/audiences" element={<AudiencesPage />} />
          <Route path="/people" element={<PeoplePage />} />
          <Route path="/bio" element={<LinkInBioPage />} />
          <Route path="/links" element={<TrackedLinksPage />} />
          <Route path="/media" element={<MediaPage />} />
          <Route path="/connect" element={<ConnectPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/automations" element={<AutomationsPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/grid" element={<GridPage />} />
          <Route path="/drafts" element={<DraftsPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/board" element={<BoardPage />} />
          <Route path="/reels" element={<ReelsPage />} />
          <Route path="/reels/team" element={<ReelsTeamPage />} />
          <Route path="/brands/new" element={<AddBrandPage />} />
          <Route path="/coach" element={<CoachPage />} />
          {/* Diagnosis now lives inside the Coach as its first step. */}
          <Route path="/diagnosis" element={<Navigate to="/coach" replace />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/playbook" element={<PlaybookPage />} />
          <Route path="/academy" element={<AcademyPage />} />
          <Route path="/tutorial" element={<TutorialPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/hub" element={<HubGate />}>
            <Route index element={<HubHomePage />} />
            <Route path="trends" element={<HubTrendsPage />} />
            <Route path="guides" element={<HubGuidesPage />} />
            <Route path="guides/:slug" element={<HubGuideDetailPage />} />
            <Route path="admin" element={<HubAdminPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}
