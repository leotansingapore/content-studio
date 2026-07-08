import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useHub } from "@/components/hub/HubGate";
import AllowlistManager from "@/components/hub/AllowlistManager";
import PostEditor from "@/components/hub/PostEditor";
import MemberList from "@/components/hub/MemberList";

const TABS = [
  { key: "clients", label: "Clients" },
  { key: "posts", label: "Posts" },
  { key: "members", label: "Members" },
] as const;

export default function HubAdminPage() {
  const { access } = useHub();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("clients");

  if (access !== "admin") {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">This area is for the hub admin.</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/hub">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to hub
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
          <Shield className="h-5 w-5" /> Hub admin
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage clients, write guides, and see who's inside.
        </p>
      </div>

      <div className="flex gap-2 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === t.key
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "clients" && <AllowlistManager />}
      {tab === "posts" && <PostEditor />}
      {tab === "members" && <MemberList />}
    </div>
  );
}
