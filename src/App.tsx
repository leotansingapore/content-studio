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
const GridPage = lazy(() => import("@/pages/GridPage"));
const DraftsPage = lazy(() => import("@/pages/DraftsPage"));
const BoardPage = lazy(() => import("@/pages/BoardPage"));
const GeneratePage = lazy(() => import("@/pages/GeneratePage"));
const BatchPage = lazy(() => import("@/pages/BatchPage"));
const CarouselPage = lazy(() => import("@/pages/CarouselPage"));
const SwipeFilePage = lazy(() => import("@/pages/SwipeFilePage"));
const TrendsPage = lazy(() => import("@/pages/TrendsPage"));
const CloneReelPage = lazy(() => import("@/pages/CloneReelPage"));
const InspirationPage = lazy(() => import("@/pages/InspirationPage"));
const FollowingPage = lazy(() => import("@/pages/FollowingPage"));
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
const ReelsPage = lazy(() => import("@/pages/ReelsPage"));
const VideoEditPage = lazy(() => import("@/pages/VideoEditPage"));
// Public pages (no sign-in), each in its own chunk.
const PreviewReviewPage = lazy(() => import("@/pages/PreviewReviewPage"));
const BioPublicPage = lazy(() => import("@/pages/BioPublicPage"));
const LinkInBioPage = lazy(() => import("@/pages/LinkInBioPage"));

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
          element={
            <ProtectedRoute>
              <StudioLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/generate" element={<GeneratePage />} />
          <Route path="/generate/batch" element={<BatchPage />} />
          <Route path="/carousel" element={<CarouselPage />} />
          <Route path="/edit" element={<VideoEditPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/fads" element={<FadsPage />} />
          <Route path="/fads/:tab" element={<FadsPage />} />
          <Route path="/recruit" element={<RecruitPage />} />
          <Route path="/recruit/engage" element={<EngagePage />} />
          <Route path="/recruit/:tab" element={<RecruitPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/inspiration" element={<InspirationPage />} />
          <Route path="/following" element={<FollowingPage />} />
          <Route path="/inspiration/:id" element={<InspirationDetailPage />} />
          <Route path="/profiles" element={<ProfilesPage />} />
          <Route path="/profiles/:id" element={<ProfileDetailPage />} />
          <Route path="/swipe" element={<SwipeFilePage />} />
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="/clone" element={<CloneReelPage />} />
          <Route path="/create-guide" element={<CreateGuidePage />} />
          <Route path="/voice" element={<VoicePage />} />
          <Route path="/brand" element={<BrandPage />} />
          <Route path="/bio" element={<LinkInBioPage />} />
          <Route path="/media" element={<MediaPage />} />
          <Route path="/connect" element={<ConnectPage />} />
          <Route path="/grid" element={<GridPage />} />
          <Route path="/drafts" element={<DraftsPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/board" element={<BoardPage />} />
          <Route path="/reels" element={<ReelsPage />} />
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
