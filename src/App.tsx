import { Navigate, Route, Routes } from "react-router-dom";

import ProtectedRoute from "@/components/ProtectedRoute";
import { Toaster } from "@/components/ui/toaster";
import Auth from "@/pages/Auth";
import StudioLayout from "@/pages/StudioLayout";
import GeneratePage from "@/pages/GeneratePage";
import InspirationPage from "@/pages/InspirationPage";
import InspirationDetailPage from "@/pages/InspirationDetailPage";
import ProfilesPage from "@/pages/ProfilesPage";
import ProfileDetailPage from "@/pages/ProfileDetailPage";
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
          <Route path="/" element={<Navigate to="/generate" replace />} />
          <Route path="/generate" element={<GeneratePage />} />
          <Route path="/inspiration" element={<InspirationPage />} />
          <Route path="/inspiration/:id" element={<InspirationDetailPage />} />
          <Route path="/profiles" element={<ProfilesPage />} />
          <Route path="/profiles/:id" element={<ProfileDetailPage />} />
          <Route path="/voice" element={<VoicePage />} />
          <Route path="/drafts" element={<DraftsPage />} />
          <Route path="/tutorial" element={<TutorialPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}
