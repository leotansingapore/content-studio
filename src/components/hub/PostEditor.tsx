import { useCallback, useEffect, useState } from "react";
import { Eye, Loader2, Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import Markdown from "@/components/hub/Markdown";
import { HUB_CATEGORIES, INDUSTRIES, type HubPost } from "@/lib/hub";
import { supabase } from "@/lib/supabase";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);

type Draft = {
  id?: string;
  title: string;
  slug: string;
  body_md: string;
  category: string;
  audience_type: "all" | "industry" | "client";
  audience_value: string;
  published: boolean;
};

const EMPTY: Draft = {
  title: "",
  slug: "",
  body_md: "",
  category: "tips",
  audience_type: "all",
  audience_value: "",
  published: false,
};

export default function PostEditor() {
  const { toast } = useToast();
  const [posts, setPosts] = useState<HubPost[]>([]);
  const [clientEmails, setClientEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const load = useCallback(async () => {
    const [p, a] = await Promise.all([
      supabase.from("hub_posts").select("*").order("created_at", { ascending: false }),
      supabase.from("hub_allowlist").select("email").order("email"),
    ]);
    setPosts((p.data as HubPost[]) ?? []);
    setClientEmails(((a.data as { email: string }[]) ?? []).map((r) => r.email));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    if (!draft.title || !draft.slug || !draft.body_md) {
      toast({ title: "Title, slug, and body are required" });
      return;
    }
    if (draft.audience_type !== "all" && !draft.audience_value) {
      toast({ title: "Pick who this post is for" });
      return;
    }
    setSaving(true);
    const row = {
      title: draft.title.trim(),
      slug: draft.slug,
      body_md: draft.body_md,
      category: draft.category,
      audience_type: draft.audience_type,
      audience_value: draft.audience_type === "all" ? null : draft.audience_value,
      published: draft.published,
      updated_at: new Date().toISOString(),
    };
    const q = draft.id
      ? supabase.from("hub_posts").update(row).eq("id", draft.id)
      : supabase.from("hub_posts").insert(row);
    const { error } = await q;
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save post", description: error.message });
      return;
    }
    toast({ title: draft.id ? "Post updated" : "Post created" });
    setDraft(null);
    load();
  };

  const togglePublish = async (p: HubPost) => {
    const { error } = await supabase
      .from("hub_posts")
      .update({ published: !p.published, updated_at: new Date().toISOString() })
      .eq("id", p.id);
    if (error) toast({ title: "Couldn't update", description: error.message });
    else load();
  };

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (draft) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{draft.id ? "Edit post" : "New post"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pe-title">Title</Label>
              <Input
                id="pe-title"
                value={draft.title}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    title: e.target.value,
                    slug: draft.id ? draft.slug : slugify(e.target.value),
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pe-slug">Slug</Label>
              <Input
                id="pe-slug"
                value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: slugify(e.target.value) })}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={draft.category}
                onValueChange={(v) => setDraft({ ...draft, category: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HUB_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Audience</Label>
              <Select
                value={draft.audience_type}
                onValueChange={(v) =>
                  setDraft({
                    ...draft,
                    audience_type: v as Draft["audience_type"],
                    audience_value: "",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  <SelectItem value="industry">One industry</SelectItem>
                  <SelectItem value="client">One client</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {draft.audience_type !== "all" && (
              <div className="space-y-1.5">
                <Label>{draft.audience_type === "industry" ? "Industry" : "Client"}</Label>
                <Select
                  value={draft.audience_value}
                  onValueChange={(v) => setDraft({ ...draft, audience_value: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(draft.audience_type === "industry" ? INDUSTRIES : clientEmails).map(
                      (v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="pe-body">Body (markdown)</Label>
              <Button variant="ghost" size="sm" onClick={() => setPreview((v) => !v)}>
                <Eye className="mr-1 h-3.5 w-3.5" /> {preview ? "Edit" : "Preview"}
              </Button>
            </div>
            {preview ? (
              <div className="min-h-48 rounded-md border border-border p-4">
                <Markdown>{draft.body_md || "*Nothing yet*"}</Markdown>
              </div>
            ) : (
              <Textarea
                id="pe-body"
                rows={16}
                className="font-mono text-xs"
                value={draft.body_md}
                onChange={(e) => setDraft({ ...draft, body_md: e.target.value })}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
            <Button
              variant="outline"
              onClick={() => setDraft({ ...draft, published: !draft.published })}
            >
              {draft.published ? "Will publish: yes" : "Will publish: no"}
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Button onClick={() => setDraft(EMPTY)}>
        <Plus className="mr-2 h-4 w-4" /> New post
      </Button>
      {posts.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No posts yet.</p>
      ) : (
        <div className="space-y-2">
          {posts.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.category} · {p.audience_type}
                    {p.audience_value ? `: ${p.audience_value}` : ""}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => togglePublish(p)}>
                  {p.published ? "Published" : "Draft"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setDraft({
                      id: p.id,
                      title: p.title,
                      slug: p.slug,
                      body_md: p.body_md,
                      category: p.category,
                      audience_type: p.audience_type,
                      audience_value: p.audience_value ?? "",
                      published: p.published,
                    })
                  }
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
