import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import ProtectedRoute from "@/components/ProtectedRoute";
import { Toaster } from "@/components/ui/toaster";
import Auth from "@/pages/Auth";
import StudioLayout from "@/pages/StudioLayout";
import HomePage from "@/pages/HomePage";
import WelcomePage from "@/pages/WelcomePage";
import GeneratePage from "@/pages/GeneratePage";
import BatchPage from "@/pages/BatchPage";
import CoachPage from "@/pages/CoachPage";
import PlaybookPage from "@/pages/PlaybookPage";
import AcademyPage from "@/pages/AcademyPage";
import CalendarPage from "@/pages/CalendarPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import PlanPage from "@/pages/PlanPage";
import InspirationPage from "@/pages/InspirationPage";
import InspirationDetailPage from "@/pages/InspirationDetailPage";
import ProfilesPage from "@/pages/ProfilesPage";
import ProfileDetailPage from "@/pages/ProfileDetailPage";
import SwipeFilePage from "@/pages/SwipeFilePage";
import TrendsPage from "@/pages/TrendsPage";
import CreateGuidePage from "@/pages/CreateGuidePage";
import VoicePage from "@/pages/VoicePage";
import DraftsPage from "@/pages/DraftsPage";
import TutorialPage from "@/pages/TutorialPage";
import NotFoundPage from "@/pages/NotFoundPage";
import HubGate from "@/components/hub/HubGate";
import HubHomePage from "@/pages/hub/HubHomePage";
import HubTrendsPage from "@/pages/hub/HubTrendsPage";
import HubGuidesPage from "@/pages/hub/HubGuidesPage";
import HubGuideDetailPage from "@/pages/hub/HubGuideDetailPage";
import HubAdminPage from "@/pages/hub/HubAdminPage";
import BoardPage from "@/pages/BoardPage";

// F.A.D.S. is a ~2K-line worksheet most sessions never open — route-level
// lazy() keeps it out of the main bundle (avoid manualChunks object form,
// which force-preloads lazy chunks).
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
          <Route
            path="/fads"
            element={
              <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading F.A.D.S…</div>}>
                <FadsPage />
              </Suspense>
            }
          />
          <Route
            path="/fads/:tab"
            element={
              <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading F.A.D.S…</div>}>
                <FadsPage />
              </Suspense>
            }
          />
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
