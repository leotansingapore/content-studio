import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Sparkles } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

export default function Auth() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/", { replace: true });
    });
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      toast({ title: "Signed in", description: "Loading your studio." });
      // First-time sign-in on this device routes to the in-app tutorial.
      // Subsequent sign-ins go straight to /generate.
      const uid = data.user?.id;
      const seenKey = uid ? `content-studio-tutorial-seen-${uid}` : null;
      const seen = seenKey ? localStorage.getItem(seenKey) : "1";
      if (seenKey && !seen) {
        try {
          localStorage.setItem(seenKey, new Date().toISOString());
        } catch {
          // ignore storage failures (Safari private mode, etc.)
        }
        navigate("/tutorial", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch (err) {
      toast({
        title: "Couldn't sign in",
        description:
          err instanceof Error ? err.message : "Check email + password.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Consultant Content Studio
          </div>
          <h1 className="font-serif text-3xl font-semibold leading-tight tracking-tight">
            Sign in to draft posts
          </h1>
          <p className="text-sm text-muted-foreground">
            Use your Academy email + password.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">Sign in</CardTitle>
            <CardDescription>
              One sign-in per device. Session stays until you sign out.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full gap-2 bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95"
                size="lg"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
            <p className="mt-4 text-xs text-muted-foreground">
              Heads up: if you only have a financial-app account and have never
              signed in to the Academy, sign in to the Academy first so your
              account gets provisioned. Then come back here.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
