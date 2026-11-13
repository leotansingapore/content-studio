// Leo's box on Studio's Overview (Fastlane's "What should Senna make for <brand>?", 13 Nov): the agent's composer with
// its four chips; a sent message opens its thread. Its own chunk, so the agent engine loads on Leo's sign-ins only.
import { useNavigate } from "react-router-dom";
import Composer from "@/components/agent/Composer";
import { links } from "@/lib/links";

export default function StudioAsk({ userId, placeholder }: { userId: string; placeholder: string }) {
  const navigate = useNavigate();
  return <Composer userId={userId} threadId={null} slot="studio" placeholder={placeholder} onSent={(id) => navigate(links.agent({ thread: id }))} />;
}
