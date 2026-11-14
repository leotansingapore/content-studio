import { Suspense, lazy, useEffect, type ComponentType } from "react";
import { createRoutesFromChildren, matchRoutes, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { profileAddress } from "@/lib/links";

import ProtectedRoute from "@/components/ProtectedRoute";
import { Toaster } from "@/components/ui/toaster";
import Auth from "@/pages/Auth";
import StudioLayout from "@/pages/StudioLayout";
import HomePage from "@/pages/HomePage";
import NotFoundPage from "@/pages/NotFoundPage";
import HubGate from "@/components/hub/HubGate";
import { scheduleAfterLoad } from "@/lib/idle";
import { SECTIONS } from "@/lib/nav";

// Every page inside the studio layout except Home is route-level lazy(), so
// the reference data they import (inspiration, advisors, top posts: ~400 KB)
// stays out of the main bundle. Auth, Home, the 404 page and the Hub gate stay
// eager: they render outside the layout's Suspense or are the landing page. The
// public roadmap is lazy behind its own Suspense (its board is ~60 KB). Avoid the manualChunks object form, which force-preloads
// lazy chunks.

/** A route-level lazy page that can also start its download before it renders. */
const page = <T extends ComponentType<any>>(load: () => Promise<{ default: T }>) => Object.assign(lazy(load), { preload: load });

/** A redirect that keeps the query, so a ?profile= link to / or /diagnosis opens on the brand it names. */
function Redirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
}

/** Your voice and Brand kit are sections of Profile since 14 Nov: an old /voice or /brand link lands on its section. */
function MovedToProfile({ from }: { from: "/brand" | "/voice" }) {
  const { search, hash } = useLocation();
  return <Navigate to={profileAddress(from, search, hash)} replace />;
}

const WelcomePage = page(() => import("@/pages/WelcomePage"));
const CoachPage = page(() => import("@/pages/CoachPage"));
const PlaybookPage = page(() => import("@/pages/PlaybookPage"));
const CalendarPage = page(() => import("@/pages/CalendarPage"));
const AnalyticsPage = page(() => import("@/pages/AnalyticsPage"));
const PlanPage = page(() => import("@/pages/PlanPage"));
const LinkedInStrategyPage = page(() => import("@/pages/LinkedInStrategyPage"));
const HooksPage = page(() => import("@/pages/HooksPage"));
const LaunchPlanPage = page(() => import("@/pages/LaunchPlanPage"));
const BrandPage = page(() => import("@/pages/BrandPage"));
const MediaPage = page(() => import("@/pages/MediaPage"));
const ConnectPage = page(() => import("@/pages/ConnectPage"));
const NotificationsPage = page(() => import("@/pages/NotificationsPage"));
const PostChoicesPage = page(() => import("@/pages/PostChoicesPage"));
const BillingPage = page(() => import("@/pages/BillingPage"));
const AccountPage = page(() => import("@/pages/AccountPage"));
const HeldPaymentsPage = page(() => import("@/pages/HeldPaymentsPage"));
const AccountsPage = page(() => import("@/pages/AccountsPage"));
const AdLauncherPage = page(() => import("@/pages/AdLauncherPage"));
const SettingsPage = page(() => import("@/pages/SettingsPage"));
const StudioPage = page(() => import("@/pages/StudioPage"));
const GridPage = page(() => import("@/pages/GridPage"));
const DraftsPage = page(() => import("@/pages/DraftsPage"));
const LibraryPage = page(() => import("@/pages/LibraryPage"));
const BoardPage = page(() => import("@/pages/BoardPage"));
const GeneratePage = page(() => import("@/pages/GeneratePage"));
const AnswerPage = page(() => import("@/pages/AnswerPage"));
const VslPage = page(() => import("@/pages/VslPage"));
const BatchPage = page(() => import("@/pages/BatchPage"));
const CarouselPage = page(() => import("@/pages/CarouselPage"));
const ImagePage = page(() => import("@/pages/ImagePage"));
const SlideshowPage = page(() => import("@/pages/SlideshowPage"));
const DesignPage = page(() => import("@/pages/DesignPage"));
const DesignEditorPage = page(() => import("@/pages/DesignEditorPage"));
const SlideCampaignsPage = page(() => import("@/pages/SlideCampaignsPage"));
const SlideCampaignPage = page(() => import("@/pages/SlideCampaignPage"));
const SlideLibrariesPage = page(() => import("@/pages/SlideLibrariesPage"));
const PhonePage = page(() => import("@/pages/PhonePage"));
const MakePage = page(() => import("@/pages/MakePage"));
const MakeFormatPage = page(() => import("@/pages/MakeFormatPage"));
const StaticFormatPage = page(() => import("@/pages/StaticFormatPage"));
const SwipeFilePage = page(() => import("@/pages/SwipeFilePage"));
const TrendsPage = page(() => import("@/pages/TrendsPage"));
const CloneReelPage = page(() => import("@/pages/CloneReelPage"));
const InspirationPage = page(() => import("@/pages/InspirationPage"));
const FollowingPage = page(() => import("@/pages/FollowingPage"));
const CompetitorsPage = page(() => import("@/pages/CompetitorsPage"));
const PeoplePage = page(() => import("@/pages/PeoplePage"));
const SavedPage = page(() => import("@/pages/SavedPage"));
const MarketPage = page(() => import("@/pages/MarketPage"));
const NorthStarPage = page(() => import("@/pages/NorthStarPage"));
const MarketingNorthStarPage = page(() => import("@/pages/MarketingNorthStarPage"));
const PostmosisMarketingNorthStarPage = page(() => import("@/pages/PostmosisMarketingNorthStarPage"));
const SeoNorthStarPage = page(() => import("@/pages/SeoNorthStarPage"));
const SocialNorthStarPage = page(() => import("@/pages/SocialNorthStarPage"));
const InspirationDetailPage = page(() => import("@/pages/InspirationDetailPage"));
const CarouselsPage = page(() => import("@/pages/CarouselsPage"));
const CarouselDetailPage = page(() => import("@/pages/CarouselDetailPage"));
const WorkingPage = page(() => import("@/pages/WorkingPage"));
const WorkingDetailPage = page(() => import("@/pages/WorkingDetailPage"));
const ProfilesPage = page(() => import("@/pages/ProfilesPage"));
const ProfileDetailPage = page(() => import("@/pages/ProfileDetailPage"));
const AcademyPage = page(() => import("@/pages/AcademyPage"));
const TutorialPage = page(() => import("@/pages/TutorialPage"));
const FeedbackPage = page(() => import("@/pages/FeedbackPage"));
const CreateGuidePage = page(() => import("@/pages/CreateGuidePage"));
const TeamPage = page(() => import("@/pages/TeamPage"));
const HubHomePage = page(() => import("@/pages/hub/HubHomePage"));
const HubTrendsPage = page(() => import("@/pages/hub/HubTrendsPage"));
const HubGuidesPage = page(() => import("@/pages/hub/HubGuidesPage"));
const HubGuideDetailPage = page(() => import("@/pages/hub/HubGuideDetailPage"));
const HubAdminPage = page(() => import("@/pages/hub/HubAdminPage"));
const FadsPage = page(() => import("@/pages/FadsPage"));
const RecruitPage = page(() => import("@/pages/RecruitPage"));
const EngagePage = page(() => import("@/pages/EngagePage"));
const AutoDmPage = page(() => import("@/pages/AutoDmPage"));
const ReelsPage = page(() => import("@/pages/ReelsPage"));
const ReelsTeamPage = page(() => import("@/pages/ReelsTeamPage"));
const AddBrandPage = page(() => import("@/pages/AddBrandPage"));
const BrandsPage = page(() => import("@/pages/BrandsPage"));
const JoinBrandPage = page(() => import("@/pages/JoinBrandPage"));
const BrandTeamPage = page(() => import("@/pages/BrandTeamPage"));
const VideoEditPage = page(() => import("@/pages/VideoEditPage"));
// Public pages (no sign-in), each in its own chunk.
const PublicRoadmap = page(() => import("@/pages/PublicRoadmap"));
const PreviewReviewPage = page(() => import("@/pages/PreviewReviewPage"));
const BioPublicPage = page(() => import("@/pages/BioPublicPage"));
const LinkInBioPage = page(() => import("@/pages/LinkInBioPage"));
const TrackedReportPublicPage = page(() => import("@/pages/TrackedReportPublicPage"));
const JoinPage = page(() => import("@/pages/JoinPage"));
const TrackedLinksPage = page(() => import("@/pages/TrackedLinksPage"));
// North star phase 5 (Leo only): stubs that answer the not-found page until their builders replace them.
const AudiencesPage = page(() => import("@/pages/AudiencesPage"));
const ScriptwriterPage = page(() => import("@/pages/ScriptwriterPage"));
const ResearchPage = page(() => import("@/pages/ResearchPage"));
const IdeasPage = page(() => import("@/pages/IdeasPage"));
const BlitzPage = page(() => import("@/pages/BlitzPage"));
const CampaignsPage = page(() => import("@/pages/CampaignsPage"));
const CampaignWizardPage = page(() => import("@/pages/CampaignWizardPage"));
const CampaignPage = page(() => import("@/pages/CampaignPage"));
// North star phase 6 (Leo only): stubs that answer the not-found page until their builders replace them.
const AgentPage = page(() => import("@/pages/AgentPage"));
const SkillsPage = page(() => import("@/pages/SkillsPage"));
const ActivityPage = page(() => import("@/pages/ActivityPage"));
const AutomationsPage = page(() => import("@/pages/AutomationsPage"));

const ROUTES = (
  <>
    {/* Public: what people asked for, what is being built, what shipped. */}
    <Route
      path="/roadmap"
      element={
        <Suspense fallback={null}>
          <PublicRoadmap />
        </Suspense>
      }
    />
    <Route path="/auth" element={<Auth />} />
    {/* Public: slides sent from Design to a phone (Send to phone), for a day. */}
    <Route
      path="/phone/:token"
      element={
        <Suspense fallback={null}>
          <PhonePage />
        </Suspense>
      }
    />
    <Route
      path="/review/:token"
      element={
        <Suspense fallback={null}>
          <PreviewReviewPage />
        </Suspense>
      }
    />
    <Route
      path="/l/:slug"
      element={
        <Suspense fallback={null}>
          <BioPublicPage />
        </Suspense>
      }
    />
    <Route
      path="/join"
      element={
        <Suspense fallback={null}>
          <JoinPage />
        </Suspense>
      }
    />
    <Route
      path="/t/report/:slug"
      element={
        <Suspense fallback={null}>
          <TrackedReportPublicPage />
        </Suspense>
      }
    />
    {/* an invite to a shared brand (docs/shared-brands.md): public, the invitee may have no account yet */}
    <Route
      path="/brands/join"
      element={
        <Suspense fallback={null}>
          <JoinBrandPage />
        </Suspense>
      }
    />
    <Route
      path="/brands/new"
      element={
        <ProtectedRoute>
          <Suspense fallback={null}>
            <AddBrandPage />
          </Suspense>
        </ProtectedRoute>
      }
    />
    <Route
      element={
        <ProtectedRoute shell>
          <StudioLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/" element={<Redirect to="/home" />} />
      <Route path="/home" element={<HomePage />} />
      <Route path="/welcome" element={<WelcomePage />} />
      <Route path="/agent" element={<AgentPage />} />
      <Route path="/agent/:thread" element={<AgentPage />} />
      <Route path="/generate" element={<GeneratePage />} />
      <Route path="/generate/batch" element={<BatchPage />} />
      <Route path="/generate/answer" element={<AnswerPage />} />
      <Route path="/generate/vsl" element={<VslPage />} />
      <Route path="/script" element={<ScriptwriterPage />} />
      <Route path="/research" element={<ResearchPage />} />
      <Route path="/carousel" element={<CarouselPage />} />
      <Route path="/image" element={<ImagePage />} />
      <Route path="/slideshow" element={<SlideshowPage />} />
      <Route path="/design" element={<DesignPage />} />
      <Route path="/design/campaigns" element={<SlideCampaignsPage />} />
      <Route path="/design/campaigns/:id" element={<SlideCampaignPage />} />
      <Route path="/design/libraries" element={<SlideLibrariesPage />} />
      <Route path="/design/:id" element={<DesignEditorPage />} />
      <Route path="/make" element={<MakePage />} />
      <Route path="/make/:format" element={<MakeFormatPage />} />
      <Route path="/make/static/:slug" element={<StaticFormatPage />} />
      <Route path="/edit" element={<VideoEditPage />} />
      <Route path="/plan" element={<PlanPage />} />
      <Route path="/linkedin" element={<LinkedInStrategyPage />} />
      <Route path="/hooks" element={<HooksPage />} />
      <Route path="/launch" element={<LaunchPlanPage />} />
      <Route path="/campaigns" element={<CampaignsPage />} />
      <Route path="/campaigns/new" element={<CampaignWizardPage />} />
      <Route path="/campaigns/:id" element={<CampaignPage />} />
      <Route path="/ideas" element={<IdeasPage />} />
      <Route path="/social-north-star" element={<SocialNorthStarPage />} />
      <Route path="/fads" element={<FadsPage />} />
      <Route path="/fads/:tab" element={<FadsPage />} />
      <Route path="/recruit" element={<RecruitPage />} />
      <Route path="/recruit/engage" element={<EngagePage />} />
      <Route path="/recruit/auto-dm" element={<AutoDmPage />} />
      <Route path="/recruit/:tab" element={<RecruitPage />} />
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/inspiration" element={<InspirationPage />} />
      <Route path="/following" element={<FollowingPage />} />
      <Route path="/competitors" element={<CompetitorsPage />} />
      <Route path="/saved" element={<SavedPage />} />
      <Route path="/market" element={<MarketPage />} />
      <Route path="/north-star" element={<NorthStarPage />} />
      <Route path="/marketing-north-star" element={<MarketingNorthStarPage />} />
      <Route path="/marketing-north-star/postmosis" element={<PostmosisMarketingNorthStarPage />} />
      <Route path="/seo-north-star" element={<SeoNorthStarPage />} />
      <Route path="/inspiration/:id" element={<InspirationDetailPage />} />
      <Route path="/carousels" element={<CarouselsPage />} />
      <Route path="/carousels/:id" element={<CarouselDetailPage />} />
      <Route path="/working" element={<WorkingPage />} />
      <Route path="/working/:id" element={<WorkingDetailPage />} />
      <Route path="/profiles" element={<ProfilesPage />} />
      <Route path="/profiles/:id" element={<ProfileDetailPage />} />
      <Route path="/swipe" element={<SwipeFilePage />} />
      <Route path="/trends" element={<TrendsPage />} />
      <Route path="/clone" element={<CloneReelPage />} />
      <Route path="/create-guide" element={<CreateGuidePage />} />
      <Route path="/voice" element={<MovedToProfile from="/voice" />} />
      <Route path="/brand" element={<MovedToProfile from="/brand" />} />
      <Route path="/brand/members" element={<BrandTeamPage />} />
      <Route path="/brand/products" element={<BrandPage part="products" />} />
      <Route path="/brand/demo-videos" element={<BrandPage part="demo-videos" />} />
      <Route path="/audiences" element={<AudiencesPage />} />
      <Route path="/people" element={<PeoplePage />} />
      <Route path="/blitz" element={<BlitzPage />} />
      <Route path="/bio" element={<LinkInBioPage />} />
      <Route path="/links" element={<TrackedLinksPage />} />
      <Route path="/media" element={<MediaPage />} />
      <Route path="/connect" element={<ConnectPage />} />
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route path="/settings/post-choices" element={<PostChoicesPage />} />
      <Route path="/settings/account" element={<AccountPage />} />
      <Route path="/settings/billing" element={<BillingPage />} />
      <Route path="/settings/held" element={<HeldPaymentsPage />} />
      <Route path="/skills" element={<SkillsPage />} />
      <Route path="/activity" element={<ActivityPage />} />
      <Route path="/automations" element={<AutomationsPage />} />
      <Route path="/accounts" element={<AccountsPage />} />
      <Route path="/adlauncher" element={<AdLauncherPage />} />
      <Route path="/brands" element={<BrandsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/studio" element={<StudioPage />} />
      <Route path="/grid" element={<GridPage />} />
      <Route path="/drafts" element={<DraftsPage />} />
      <Route path="/library" element={<LibraryPage />} />
      <Route path="/team" element={<TeamPage />} />
      <Route path="/board" element={<BoardPage />} />
      <Route path="/reels" element={<ReelsPage />} />
      <Route path="/reels/team" element={<ReelsTeamPage />} />
      <Route path="/coach" element={<CoachPage />} />
      {/* Diagnosis now lives inside the Coach as its first step. */}
      <Route path="/diagnosis" element={<Redirect to="/coach" />} />
      <Route path="/analytics" element={<AnalyticsPage />} />
      <Route path="/playbook" element={<PlaybookPage />} />
      <Route path="/academy" element={<AcademyPage />} />
      <Route path="/tutorial" element={<TutorialPage />} />
      <Route path="/feedback" element={<FeedbackPage />} />
      <Route path="/hub" element={<HubGate />}>
        <Route index element={<HubHomePage />} />
        <Route path="trends" element={<HubTrendsPage />} />
        <Route path="guides" element={<HubGuidesPage />} />
        <Route path="guides/:slug" element={<HubGuideDetailPage />} />
        <Route path="admin" element={<HubAdminPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  </>
);

const ROUTE_OBJECTS = createRoutesFromChildren(ROUTES);
const started = new Set<string>();
/** Starts downloading the code of the page at `pathname`, once; a failure is left to the render (it reloads for a new build). */
function preloadPage(pathname: string) {
  if (started.has(pathname)) return;
  started.add(pathname);
  for (const m of matchRoutes(ROUTE_OBJECTS, pathname) ?? []) {
    const type = (m.route.element as { type?: { preload?: () => Promise<unknown> } } | undefined)?.type;
    type?.preload?.().catch(() => {});
  }
}

if (typeof window !== "undefined") {
  // The opened page's code downloads alongside the session check and the sync pull the studio waits on (14 Nov: it
  // started only after them, ~1.3 s later on Leo's account).
  preloadPage(window.location.pathname);
  // A link the pointer rests on or the keyboard reaches is usually opened next, so its page is ready by the click.
  const intent = (e: Event) => {
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (a && a.origin === window.location.origin) preloadPage(a.pathname);
  };
  document.addEventListener("pointerover", intent, { passive: true });
  document.addEventListener("focusin", intent);
  // The sidebar's sections (the phone's bottom bar) once the opened page has drawn, unless the device saves data. Not
  // at the first idle moment: that comes while the page still waits on the sync, and they then compete with its render.
  if (!saveData()) scheduleAfterLoad(3_000, () => SECTIONS.forEach((s) => preloadPage(s.to)));
}

function saveData() {
  return !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
}

/** The pages of the links on screen: the likely next tap, and a phone has no hover to start them early. */
function preloadVisibleLinks() {
  for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (a.origin !== window.location.origin) continue;
    const r = a.getBoundingClientRect();
    if (r.width > 0 && r.bottom > 0 && r.top < window.innerHeight) preloadPage(a.pathname);
  }
}

export default function App() {
  const { pathname } = useLocation();
  // 2 s after each page opens and the browser is idle, so its own code and data go first
  useEffect(() => {
    if (!saveData()) scheduleAfterLoad(2_000, preloadVisibleLinks);
  }, [pathname]);
  return (
    <>
      <Routes>{ROUTES}</Routes>
      <Toaster />
    </>
  );
}
