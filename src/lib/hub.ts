import { supabase } from "@/lib/supabase";

export type HubStatus = "none" | "client" | "active" | "canceled";

export type HubMembership = {
  user_id: string;
  email: string;
  status: HubStatus;
  is_admin: boolean;
  industry: string | null;
  current_period_end: string | null;
};

export type HubPost = {
  id: string;
  title: string;
  slug: string;
  body_md: string;
  category: "editing" | "videography" | "trends" | "tips";
  audience_type: "all" | "industry" | "client";
  audience_value: string | null;
  published: boolean;
  created_at: string;
  updated_at: string;
};

export type HubTrend = {
  id: string;
  niche: string;
  title: string;
  summary_md: string;
  angles_md: string;
  source_urls: string[];
  example_video_urls: string[];
  audience_type: "all" | "industry" | "client";
  audience_value: string | null;
  created_at: string;
};

export const INDUSTRIES = [
  "Finance & Insurance",
  "Real Estate",
  "Fitness & Wellness",
  "F&B / Restaurants",
  "Beauty & Aesthetics",
  "Coaching & Education",
  "E-commerce & Retail",
  "Travel & Lifestyle",
  "Tech & SaaS",
  "Other",
];

export const HUB_CATEGORIES = [
  { value: "editing", label: "Editing" },
  { value: "videography", label: "Videography" },
  { value: "trends", label: "Trends" },
  { value: "tips", label: "Tips" },
] as const;

export function hubAccess(m: HubMembership | null): "admin" | "member" | "locked" {
  if (!m) return "locked";
  if (m.is_admin) return "admin";
  return m.status === "client" || m.status === "active" ? "member" : "locked";
}

export async function fetchMembership(): Promise<HubMembership | null> {
  const { data } = await supabase
    .from("hub_memberships")
    .select("user_id,email,status,is_admin,industry,current_period_end")
    .maybeSingle();
  return (data as HubMembership | null) ?? null;
}

export async function claimClientAccess() {
  const { data, error } = await supabase.rpc("hub_claim_client_access");
  if (error) throw error;
  return data as "client" | "not-allowlisted" | "no-auth";
}

export async function setIndustry(industry: string) {
  const { error } = await supabase.rpc("hub_set_industry", { p_industry: industry });
  if (error) throw error;
}
