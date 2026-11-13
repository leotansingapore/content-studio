import type { ReactNode } from "react";
import { CheckIcon } from "@phosphor-icons/react";
import { Actions, PrimaryPill, QuietPill, useLogoTile } from "@/components/onboarding/parts";
import { readableInk } from "@/lib/onboardingFlow";

export interface FinishFacts {
  name: string;
  logo: string | null;
  colours: string[];
  voice: string;
  topics: string[];
  networks: string[];
  connected: string[];
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 sm:px-5">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success/15 text-success">
        <CheckIcon size={12} weight="bold" />
      </span>
      <span className="w-24 shrink-0 text-[13px] font-medium leading-5 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-[14px] leading-5 text-foreground [overflow-wrap:anywhere]">{children}</span>
    </div>
  );
}

export function FinishStep({ facts, firstTopic, busy, onWrite, onHome, titleId }: { facts: FinishFacts; firstTopic: string; busy: boolean; onWrite: () => void; onHome: () => void; titleId: string }) {
  const main = facts.colours[0] ?? "#1E3A8A";
  const tile = useLogoTile(facts.logo);
  return (
    <div className="flex w-full max-w-[560px] flex-1 flex-col justify-center gap-8 pb-[6vh]">
      <div className="flex flex-col items-center gap-4 text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-500">
        <span className={`${tile} grid h-20 w-20 place-items-center overflow-hidden rounded-2xl border-4 border-card shadow-card`}>
          {facts.logo ? (
            <img src={facts.logo} alt="" className="max-h-16 max-w-16 object-contain" />
          ) : (
            <span className="grid h-full w-full place-items-center text-3xl font-bold" style={{ backgroundColor: main, color: readableInk(main) }}>
              {facts.name.trim().charAt(0).toUpperCase() || "?"}
            </span>
          )}
        </span>
        <div className="space-y-2">
          <h1 id={titleId} tabIndex={-1} className="max-w-full text-[24px] font-bold leading-8 text-foreground outline-none [overflow-wrap:anywhere] focus-visible:shadow-none focus-visible:outline-none sm:text-[26px]">
            {facts.name} is set up
          </h1>
          <p className="text-base font-medium text-muted-foreground">Every post, plan and calendar now starts from this.</p>
        </div>
      </div>
      <div className="divide-y divide-border/70 overflow-hidden rounded-[20px] bg-card shadow-card">
        <Row label="Brand">{facts.name}</Row>
        {facts.colours.length > 0 && (
          <Row label={facts.colours.length > 1 ? "Colours" : "Colour"}>
            <span className="inline-flex items-center gap-1.5 align-top">
              {facts.colours.map((c) => (
                <span key={c} className="h-4 w-4 rounded-full border border-foreground/20" style={{ backgroundColor: c }} title={c} />
              ))}
              <span className="ml-1 text-[13px] uppercase text-muted-foreground">{facts.colours[0]}</span>
            </span>
          </Row>
        )}
        {facts.voice.trim() && <Row label="Voice"><span className="line-clamp-2">{facts.voice}</span></Row>}
        {facts.topics.length > 0 && <Row label="Topics">{facts.topics.join(", ")}</Row>}
        {facts.networks.length > 0 && <Row label="Posting on">{facts.networks.join(", ")}</Row>}
        {facts.connected.length > 0 && <Row label="Connected">{facts.connected.join(", ")}</Row>}
      </div>
      <div className="space-y-3">
        {firstTopic && <p className="text-center text-[13px] text-muted-foreground [overflow-wrap:anywhere]">First topic: {firstTopic}</p>}
        <Actions className="sm:justify-center">
          <QuietPill onClick={onHome} disabled={busy}>
            Go to Home
          </QuietPill>
          <PrimaryPill onClick={onWrite} disabled={busy}>
            {firstTopic ? "Write my first post" : "Write a post"}
          </PrimaryPill>
        </Actions>
      </div>
    </div>
  );
}
