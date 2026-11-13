// "Invite your team", after the review on /brands/new and /welcome (docs/shared-brands.md). One email box, the people
// already invited below it, and Continue, which is always there: the step is skipped with Continue alone.
import { TeamInvite } from "@/components/TeamInvite";
import { Actions, PrimaryPill, StepTitle } from "@/components/onboarding/parts";

export function TeamStep({ titleId, profileId, brandName, busy, onContinue }: { titleId: string; profileId: string; brandName: string; busy: boolean; onContinue: () => void }) {
  return (
    <div className="flex w-full max-w-[560px] flex-1 flex-col justify-center gap-10 pb-[2vh] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
      <StepTitle id={titleId} title="Invite your team" lead={`They work on ${brandName}'s posts, plan and calendar with you.`} />
      <TeamInvite profileId={profileId} brandName={brandName} onboarding />
      <Actions className="sm:justify-center">
        <PrimaryPill onClick={onContinue} disabled={busy}>
          Continue
        </PrimaryPill>
      </Actions>
    </div>
  );
}
