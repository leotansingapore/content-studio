import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import ProtectedRoute from "@/components/ProtectedRoute";
import { Toaster } from "@/components/ui/toaster";
import Auth from "@/pages/Auth";
import StudioLayout from "@/pages/StudioLayout";
import HomePage from "@/pages/HomePage";
import WelcomePage from "@/pages/WelcomePage";
import CoachPage from "@/pages/CoachPage";
import PlaybookPage from "@/pages/PlaybookPage";
import CalendarPage from "@/pages/CalendarPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import PlanPage from "@/pages/PlanPage";
import VoicePage from "@/pages/VoicePage";
import DraftsPage from "@/pages/DraftsPage";
import NotFoundPage from "@/pages/NotFoundPage";
import HubGate from "@/components/hub/HubGate";
import BoardPage from "@/pages/BoardPage";

// F.A.D.S. is a ~2K-line worksheet most sessions never open — route-level
// lazy() keeps it out of the main bundle (avoid manualChunks object form,
// which force-preloads lazy chunks).
const GeneratePage = lazy(() => import("@/pages/GeneratePage"));
const BatchPage = lazy(() => import("@/pages/BatchPage"));
const SwipeFilePage = lazy(() => import("@/pages/SwipeFilePage"));
const TrendsPage = lazy(() => import("@/pages/TrendsPage"));
const InspirationPage = lazy(() => import("@/pages/InspirationPage"));
const InspirationDetailPage = lazy(() => import("@/pages/InspirationDetailPage"));
const ProfilesPage = lazy(() => import("@/pages/ProfilesPage"));
const ProfileDetailPage = lazy(() => import("@/pages/ProfileDetailPage"));
const AcademyPage = lazy(() => import("@/pages/AcademyPage"));
const TutorialPage = lazy(() => import("@/pages/TutorialPage"));
const CreateGuidePage = lazy(() => import("@/pages/CreateGuidePage"));
const HubHomePage = lazy(() => import("@/pages/hub/HubHomePage"));
const HubTrendsPage = lazy(() => import("@/pages/hub/HubTrendsPage"));
const HubGuidesPage = lazy(() => import("@/pages/hub/HubGuidesPage"));
const HubGuideDetailPage = lazy(() => import("@/pages/hub/HubGuideDetailPage"));
const HubAdminPage = lazy(() => import("@/pages/hub/HubAdminPage"));
const FadsPage = lazy(() => import("@/pages/FadsPage"));

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/auth" element={<Auth />} />
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
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/fads" element={<FadsPage />} />
          <Route path="/fads/:tab" element={<FadsPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/inspiration" element={<InspirationPage />} />
          <Route path="/inspiration/:id" element={<InspirationDetailPage />} />
          <Route path="/profiles" element={<ProfilesPage />} />
          <Route path="/profiles/:id" element={<ProfileDetailPage />} />
          <Route path="/swipe" element={<SwipeFilePage />} />
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="/create-guide" element={<CreateGuidePage />} />
          <Route path="/voice" element={<VoicePage />} />
          <Route path="/drafts" element={<DraftsPage />} />
          <Route path="/board" element={<BoardPage />} />
          <Route path="/coach" element={<CoachPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/playbook" element={<PlaybookPage />} />
          <Route path="/academy" element={<AcademyPage />} />
          <Route path="/tutorial" element={<TutorialPage />} />
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
