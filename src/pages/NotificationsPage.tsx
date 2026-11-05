// /notifications (Settings > You): the phone alerts and the Monday results email, where every other app keeps them
// (Buffer, Hootsuite and Fastlane list Notifications under Settings). Moved here from My Playbook's Reminders card.
import { useEffect, useState } from "react";
import NotifySettings from "@/components/NotifySettings";
import { supabase } from "@/lib/supabase";

export default function NotificationsPage() {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  useEffect(() => {
    // getSession reads the stored session: no Auth round trip under the client lock
    void supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (u) setUser({ id: u.id, email: u.email ?? "" });
    });
  }, []);
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Notifications</h1>
      <div className="rounded-xl border border-border/70 bg-card p-4 sm:p-5">
        {user ? <NotifySettings userId={user.id} email={user.email} /> : <div className="h-24" aria-busy="true" />}
      </div>
    </div>
  );
}
