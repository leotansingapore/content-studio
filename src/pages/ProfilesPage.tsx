import { useEffect } from "react";
import AdvisorProfiles from "@/components/AdvisorProfiles";

export default function ProfilesPage() {
  useEffect(() => {
    document.title = "Profiles - Content Studio";
  }, []);
  return <AdvisorProfiles />;
}
