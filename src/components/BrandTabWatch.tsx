// The open brand is one per device (profiles.ts ACTIVE_PREFIX). When another tab opens a different brand, through the
// switcher or a ?profile= link, this tab would save into that brand while still showing its own (Leo, 29 Oct: a test
// post written under "Me" landed in ActivityTracker). This bar stops the tab until it follows the other tab's brand.
// A "Stay on this brand" choice waits on a fix: a tab on another brand re-applies its own brand and reloads whenever
// the device's brand changes (seen on the live app, 29 Oct), so putting this tab's brand back would be undone at once.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { activeProfileId, brandAddress, brandChange, loadProfiles } from "@/lib/profiles";

export default function BrandTabWatch({ userId }: { userId: string | null }) {
  const [tabBrand, setTabBrand] = useState<string | null>(null);
  const [other, setOther] = useState<string | null>(null);
  const switchRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setTabBrand(userId ? activeProfileId(userId) : null);
    setOther(null);
  }, [userId]);

  useEffect(() => {
    if (!userId || !tabBrand) return;
    const onStorage = (e: StorageEvent) => {
      const change = brandChange(userId, e.key, e.newValue, tabBrand);
      if (change !== undefined) setOther(change);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId, tabBrand]);

  useEffect(() => {
    if (other) switchRef.current?.focus();
  }, [other]);

  if (!userId || !tabBrand || !other) return null;
  const name = (id: string) => loadProfiles(userId).find((p) => p.id === id)?.name ?? "another brand";

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-foreground/40 px-4 pt-24">
      <div role="alertdialog" aria-modal="true" aria-labelledby="brand-tab-title" aria-describedby="brand-tab-why" className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl">
        <p id="brand-tab-title" className="font-semibold text-foreground">
          {name(other)} is open in another tab.
        </p>
        <p id="brand-tab-why" className="mt-1 text-sm text-muted-foreground">
          Anything you save here would go to {name(other)}, not {name(tabBrand)}.
        </p>
        <div className="mt-4">
          {/* open this address on the other brand: a plain reload would re-apply the ?profile= it still names and switch
              the device back. Write keeps the brief being typed (sessionStorage) */}
          <Button
            ref={switchRef}
            className="min-h-11"
            onClick={() => {
              const { pathname, search, hash } = window.location;
              window.location.assign(brandAddress(pathname, search, hash, other, loadProfiles(userId).map((p) => p.id)) ?? `${pathname}${search}${hash}`);
            }}
          >
            Switch to {name(other)}
          </Button>
        </div>
      </div>
    </div>
  );
}
