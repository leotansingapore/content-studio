// The agent's chats in the sidebar, under its Start a chat button (Fastlane's shell, docs/fastlane-nav-gap.md). The
// shell loads this chunk for the agent's sign-ins only, so the agent's code stays out of everyone else's main chunk.
import { useLocation } from "react-router-dom";
import { useThreads } from "@/components/agent/AgentThread";
import ThreadList from "@/components/agent/ThreadList";

export default function SidebarThreads({ userId }: { userId: string }) {
  const { pathname } = useLocation();
  const threads = useThreads(userId);
  const current = pathname.startsWith("/agent/") ? decodeURIComponent(pathname.slice("/agent/".length)) : null;
  return <ThreadList userId={userId} threads={threads} current={current} newChat={false} />;
}
