import { Navigate, Route, Routes } from "react-router-dom";

import ProtectedRoute from "@/components/ProtectedRoute";
import { Toaster } from "@/components/ui/toaster";
import Auth from "@/pages/Auth";
import StudioLayout from "@/pages/StudioLayout";
import HomePage from "@/pages/HomePage";
import WelcomePage from "@/pages/WelcomePage";
import GeneratePage from "@/pages/GeneratePage";
import CoachPage from "@/pages/CoachPage";
import PlaybookPage from "@/pages/PlaybookPage";
import AcademyPage from "@/pages/AcademyPage";
import CalendarPage from "@/pages/CalendarPage";
import PlanPage from "@/pages/PlanPage";
import InspirationPage from "@/pages/InspirationPage";
import InspirationDetailPage from "@/pages/InspirationDetailPage";
import ProfilesPage from "@/pages/ProfilesPage";
import ProfileDetailPage from "@/pages/ProfileDetailPage";
import SwipeFilePage from "@/pages/SwipeFilePage";
import CreateGuidePage from "@/pages/CreateGuidePage";
import VoicePage from "@/pages/VoicePage";
import DraftsPage from "@/pages/DraftsPage";
import TutorialPage from "@/pages/TutorialPage";
import NotFoundPage from "@/pages/NotFoundPage";

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
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/inspiration" element={<InspirationPage />} />
          <Route path="/inspiration/:id" element={<InspirationDetailPage />} />
          <Route path="/profiles" element={<ProfilesPage />} />
          <Route path="/profiles/:id" element={<ProfileDetailPage />} />
          <Route path="/swipe" element={<SwipeFilePage />} />
          <Route path="/create-guide" element={<CreateGuidePage />} />
          <Route path="/voice" element={<VoicePage />} />
          <Route path="/drafts" element={<DraftsPage />} />
          <Route path="/coach" element={<CoachPage />} />
          <Route path="/playbook" element={<PlaybookPage />} />
          <Route path="/academy" element={<AcademyPage />} />
          <Route path="/tutorial" element={<TutorialPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}
