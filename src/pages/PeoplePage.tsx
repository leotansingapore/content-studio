// Faces and voices (/people, Leo's sign-ins only; docs/north-star/items/people-my-face.md): the people your AI videos
// are made from. Tabs in the URL (?tab=, face left out): Your face, and Presenters (people-presenters). Everyone else
// gets the not-found page.
import FaceTab from "@/components/people/FaceTab";
import PresentersTab from "@/components/people/PresentersTab";
import SectionTabs, { PLAYBOOK_TABS } from "@/components/SectionTabs";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useUrlState, useUrlUpdate } from "@/lib/urlState";
import NotFoundPage from "@/pages/NotFoundPage";

const TABS = [{ id: "face", label: "Your face" }, { id: "presenters", label: "Presenters" }] as const;
type Tab = (typeof TABS)[number]["id"];

export default function PeoplePage() {
  const leo = useLeoUser();
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage />;
  return <People userId={leo.id} />;
}

function People({ userId }: { userId: string }) {
  const [tab] = useUrlState<Tab>("tab", "face", { allowed: TABS.map((t) => t.id) });
  const update = useUrlUpdate();
  // a tab's open things close with it, so switching back never reopens the camera or a sheet
  const setTab = (id: Tab) => update({ tab: id === "face" ? null : id, record: null, make: null, presenter: null });
  return (
    <div className="space-y-6">
      <SectionTabs tabs={PLAYBOOK_TABS} />
      <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Faces and voices</h1>
      {TABS.length > 1 && (
        <div role="tablist" aria-label="Faces and voices" className="flex w-full gap-1 rounded-lg border border-border/60 bg-muted/40 p-1 sm:inline-flex sm:w-auto">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`flex-1 rounded-md px-2 py-2 text-sm font-medium transition-colors sm:flex-none sm:px-4 [@media(pointer:coarse)]:min-h-11 ${
                tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      {tab === "face" && <FaceTab userId={userId} />}
      {tab === "presenters" && <PresentersTab userId={userId} />}
    </div>
  );
}
