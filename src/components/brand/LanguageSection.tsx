// Post language (edit-translate). After posting times on /brand, #language, Leo only (BrandPage mounts it).
// The brand's language for posts: English (unset) or Chinese, Malay or Tamil, saved in the kit as postLang.
// Posts stay written and checked in English; Write makes a version in this language beside each one (translate-ui).

import type { CarouselBrand } from "@/lib/carousel";
import type { PostLang } from "@/lib/links";
import { LANG_NAMES } from "@/lib/translate";

const CHOICES: [PostLang | undefined, string][] = [[undefined, "English"], ...(Object.entries(LANG_NAMES) as [PostLang, string][])];

/** setBrand goes through BrandPage's own save, so two writers never race on the kit (phase4-build-brief.md, decision 14). */
export default function LanguageSection({ brand, setBrand }: { userId: string; brand: CarouselBrand; setBrand: (patch: Partial<CarouselBrand>) => void }) {
  return (
    <section id="language" className="scroll-mt-20 space-y-3 rounded-xl border border-border/60 p-4 shadow-card" data-testid="language">
      <h2 id="brand-language-label" className="font-serif text-lg font-semibold">Post language</h2>
      <div role="group" aria-labelledby="brand-language-label" className="flex flex-wrap gap-1.5">
        {CHOICES.map(([lang, label]) => (
          <button
            key={label}
            type="button"
            aria-pressed={brand.postLang === lang}
            onClick={() => setBrand({ postLang: lang })}
            className={`min-h-9 rounded-full border px-3 text-xs font-medium transition-colors [@media(pointer:coarse)]:min-h-11 ${brand.postLang === lang ? "border-primary/60 bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Posts are written in English and checked, then a version in this language is made beside it.</p>
    </section>
  );
}
