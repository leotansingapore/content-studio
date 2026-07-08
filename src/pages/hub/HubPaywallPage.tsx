import { useState } from "react";
import { Crown, Loader2, Sparkles, TrendingUp, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useHub } from "@/components/hub/HubGate";
import { claimClientAccess } from "@/lib/hub";
import { supabase } from "@/lib/supabase";

const PERKS = [
  {
    icon: TrendingUp,
    title: "Trend drops every 5 hours",
    desc: "A scout researches what's popping in your niche around the clock and turns it into concrete angles you can film this week.",
  },
  {
    icon: Video,
    title: "Editing & videography guides",
    desc: "The exact editing workflows, shooting setups, and post checklists used on real client content.",
  },
  {
    icon: Sparkles,
    title: "Tips for YOUR industry",
    desc: "Members pick their industry and see hooks, formats, and content plays tailored to it — not generic advice.",
  },
];

export default function HubPaywallPage() {
  const { refresh } = useHub();
  const { toast } = useToast();
  const [subLoading, setSubLoading] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);

  const subscribe = async () => {
    setSubLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("hub-checkout", { body: {} });
      if (error || !data?.url) throw error ?? new Error("no-url");
      window.location.href = data.url as string;
    } catch {
      toast({
        title: "Payments are launching soon",
        description: "Checkout isn't live yet. Contact Leo to get early access.",
      });
      setSubLoading(false);
    }
  };

  const claim = async () => {
    setClaimLoading(true);
    try {
      const result = await claimClientAccess();
      if (result === "client") {
        toast({ title: "Welcome!", description: "Client access unlocked. Enjoy the hub." });
        await refresh();
      } else {
        toast({
          title: "Email not on the client list",
          description: "Your login email isn't registered as a client yet. Contact Leo to get added.",
        });
      }
    } catch {
      toast({
        title: "Couldn't check client access",
        description: "Something went wrong. Try again in a minute.",
      });
    } finally {
      setClaimLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-1 py-4">
      <div className="space-y-2 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
          <Crown className="h-3.5 w-3.5" /> Members Hub
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Fresh trends, real guides, angles made for you
        </h1>
        <p className="mx-auto max-w-xl text-sm text-muted-foreground">
          Everything I use to make client content perform — trend research refreshed every 5
          hours, step-by-step editing and videography guides, and tips scoped to your industry.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {PERKS.map((p) => (
          <Card key={p.title}>
            <CardHeader className="pb-2">
              <p.icon className="h-5 w-5 text-primary" />
              <CardTitle className="text-sm">{p.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-xs leading-relaxed">{p.desc}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-primary/30">
        <CardContent className="flex flex-col items-center gap-4 py-6 text-center">
          <div>
            <div className="text-3xl font-semibold">
              SGD 49<span className="text-base font-normal text-muted-foreground">/month</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Cancel anytime.</p>
          </div>
          <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row">
            <Button className="flex-1" onClick={subscribe} disabled={subLoading}>
              {subLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Subscribe
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={claim}
              disabled={claimLoading}
            >
              {claimLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              I'm a client
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Already working with Leo? Client access is free — tap "I'm a client" and we'll
            match your login email.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
