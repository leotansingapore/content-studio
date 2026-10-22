// People who sign (brand-kit). After You on /brand, #people, Leo only (BrandPage mounts it). Up to 4 people with a
// photo, name, role and handle, picked per carousel as "Signed by". Their photos are footer pictures only: never sent
// to an AI model and never offered in "Who speaks" (phase4-build-brief.md, decision 7).

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import { MAX_HANDLE_CHARS, MAX_IMAGE_CHARS, MAX_NAME_CHARS, MAX_PEOPLE, MAX_ROLE_CHARS, normalizeHandle, type CarouselBrand } from "@/lib/carousel";

type Person = NonNullable<CarouselBrand["people"]>[number];

/** setBrand goes through BrandPage's own save (decision 14); `photoOf` is the page's 256 px square crop of the headshot. */
export default function PeopleWhoSign({
  brand,
  setBrand,
  photoOf,
  onError,
}: {
  brand: CarouselBrand;
  setBrand: (patch: Partial<CarouselBrand>) => void;
  photoOf: (file: File) => Promise<string>;
  onError: (title: string, description?: string) => void;
}) {
  const people = brand.people ?? [];
  const edit = (id: string, patch: Partial<Person>) => setBrand({ people: people.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const add = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return onError("Pick an image file");
    try {
      const photo = await photoOf(file);
      if (photo.length > MAX_IMAGE_CHARS) return onError("That photo is too detailed to store", "Try a smaller photo.");
      setBrand({ people: [...people, { id: `p${Date.now().toString(36)}`, name: "", photo }] });
    } catch (e) {
      onError("Couldn't use that image", (e as Error).message);
    }
  };

  return (
    <section id="people" className="scroll-mt-20 space-y-3 rounded-xl border border-border/60 p-4 shadow-card" data-testid="people">
      <div className="flex items-center gap-1">
        <h2 className="font-serif text-lg font-semibold">People who sign</h2>
        <InfoTip label="About people who sign">Pick who signs each carousel or video.</InfoTip>
      </div>
      {people.length > 0 && (
        <ul className="space-y-3">
          {people.map((p, i) => (
            <li key={p.id} className="flex items-start gap-3">
              <img src={p.photo} alt="" className="mt-0.5 h-11 w-11 shrink-0 rounded-full border border-border/70 object-cover" />
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-3">
                <Input value={p.name} maxLength={MAX_NAME_CHARS} placeholder="Name" aria-label={`Person ${i + 1}: name`} onChange={(e) => edit(p.id, { name: e.target.value })} />
                <Input value={p.role ?? ""} maxLength={MAX_ROLE_CHARS} placeholder="Role" aria-label={`Person ${i + 1}: role`} onChange={(e) => edit(p.id, { role: e.target.value })} />
                <Input
                  value={p.handle ?? ""}
                  maxLength={MAX_HANDLE_CHARS}
                  placeholder="@handle (optional)"
                  aria-label={`Person ${i + 1}: handle`}
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(e) => edit(p.id, { handle: e.target.value })}
                  onBlur={() => p.handle && normalizeHandle(p.handle) !== p.handle && edit(p.id, { handle: normalizeHandle(p.handle) })}
                />
              </div>
              <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" aria-label={`Remove ${p.name || `person ${i + 1}`}`} onClick={() => setBrand({ people: people.filter((x) => x.id !== p.id) })}>
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {people.length < MAX_PEOPLE ? (
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-semibold hover:border-primary/40 [@media(pointer:coarse)]:h-11">
          <Plus className="h-3.5 w-3.5" /> Add a person
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void add(f); }} />
        </label>
      ) : (
        <p className="text-xs text-muted-foreground">Up to {MAX_PEOPLE} people.</p>
      )}
    </section>
  );
}
