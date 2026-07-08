import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { HubMembership } from "@/lib/hub";
import { supabase } from "@/lib/supabase";

const STATUS_LABEL: Record<string, string> = {
  client: "Client (free)",
  active: "Subscriber",
  canceled: "Canceled",
  none: "No access",
};

export default function MemberList() {
  const [rows, setRows] = useState<HubMembership[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("hub_memberships")
      .select("user_id,email,status,is_admin,industry,current_period_end")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setRows((data as HubMembership[]) ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No members yet.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map((m) => (
        <Card key={m.user_id}>
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {m.email}
                {m.is_admin && (
                  <span className="ml-2 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    admin
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {STATUS_LABEL[m.status] ?? m.status}
                {m.industry ? ` · ${m.industry}` : ""}
                {m.current_period_end
                  ? ` · renews ${new Date(m.current_period_end).toLocaleDateString()}`
                  : ""}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
