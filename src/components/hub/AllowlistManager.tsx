import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { INDUSTRIES } from "@/lib/hub";
import { supabase } from "@/lib/supabase";

type AllowRow = {
  id: string;
  email: string;
  client_name: string;
  niche: string;
  brand_notes: string;
  created_at: string;
};

const EMPTY = { email: "", client_name: "", niche: "", brand_notes: "" };

export default function AllowlistManager() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AllowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("hub_allowlist")
      .select("*")
      .order("created_at", { ascending: false });
    setRows((data as AllowRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form.email || !form.client_name || !form.niche) {
      toast({ title: "Email, name, and niche are required" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("hub_allowlist").upsert(
      {
        email: form.email.trim().toLowerCase(),
        client_name: form.client_name.trim(),
        niche: form.niche.trim(),
        brand_notes: form.brand_notes.trim(),
      },
      { onConflict: "email" },
    );
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save client", description: error.message });
      return;
    }
    setForm(EMPTY);
    toast({ title: "Client saved" });
    load();
  };

  const remove = async (row: AllowRow) => {
    if (!window.confirm(`Remove ${row.email} from the client list?`)) return;
    const { error } = await supabase.from("hub_allowlist").delete().eq("id", row.id);
    if (error) {
      toast({ title: "Couldn't remove", description: error.message });
      return;
    }
    toast({ title: "Client removed", description: "Their access ends next hub visit." });
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add / update client</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="al-email">Email</Label>
              <Input
                id="al-email"
                type="email"
                placeholder="client@company.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="al-name">Client name</Label>
              <Input
                id="al-name"
                placeholder="Jane from Acme"
                value={form.client_name}
                onChange={(e) => setForm({ ...form, client_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="al-niche">Niche</Label>
              <Input
                id="al-niche"
                list="hub-industries"
                placeholder="e.g. Real Estate"
                value={form.niche}
                onChange={(e) => setForm({ ...form, niche: e.target.value })}
              />
              <datalist id="hub-industries">
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="al-notes">Brand notes (used by the trend scout to tailor angles)</Label>
            <Textarea
              id="al-notes"
              rows={3}
              placeholder="Voice, offers, audience, platforms, what they will/won't post..."
              value={form.brand_notes}
              onChange={(e) => setForm({ ...form, brand_notes: e.target.value })}
            />
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Save client
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No clients yet — add the first one above.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-wrap items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {r.client_name}{" "}
                    <span className="font-normal text-muted-foreground">({r.email})</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{r.niche}</p>
                  {r.brand_notes && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">
                      {r.brand_notes}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setForm({ ...r })}
                  >
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(r)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
