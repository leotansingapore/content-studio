import { useEffect } from "react";
import AdvisorProfiles from "@/components/AdvisorProfiles";

export default function ProfilesPage() {
  useEffect(() => {
    document.title = "Creators to follow - Postmosis";
  }, []);
  return <AdvisorProfiles />;
}
