// The one footer every stepped maker shares: where you are, Back, and one filled Continue, always in that order.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StepFooter, { stepLine } from "./StepFooter";

const noop = () => undefined;
const buttons = (out: string) => [...out.matchAll(/<button([^>]*)>([^<]*)/g)].map((m) => ({ text: m[2], disabled: / disabled=""/.test(m[1]), filled: /\bbg-primary\b/.test(m[1]) }));

describe("stepLine", () => {
  it("counts from one and names the step", () => {
    expect(stepLine(2, 4, "Funnel")).toBe("Step 2 of 4 | Funnel");
  });
});

describe("StepFooter", () => {
  it("shows the step line, then Back, then one filled Continue", () => {
    const out = renderToStaticMarkup(<StepFooter step={2} total={4} name="Funnel" onBack={noop} onContinue={noop} />);
    expect(out).toMatch(/<p role="status"[^>]*>Step 2 of 4 \| Funnel<\/p>/);
    expect(out.indexOf("Step 2 of 4")).toBeLessThan(out.indexOf(">Back"));
    expect(buttons(out)).toEqual([
      { text: "Back", disabled: false, filled: false },
      { text: "Continue", disabled: false, filled: true },
    ]);
  });

  it("keeps Back in its place on the first step, switched off", () => {
    const out = renderToStaticMarkup(<StepFooter step={1} total={3} name="Who" onContinue={noop} />);
    expect(buttons(out)[0]).toEqual({ text: "Back", disabled: true, filled: false });
  });

  it("names the way back Cancel where the first step closes the maker", () => {
    const out = renderToStaticMarkup(<StepFooter step={1} total={3} name="Where" onBack={noop} backLabel="Cancel" onContinue={noop} />);
    expect(buttons(out)[0]).toEqual({ text: "Cancel", disabled: false, filled: false });
  });

  it("says why Continue is off", () => {
    const out = renderToStaticMarkup(<StepFooter step={1} total={3} name="Who" onContinue={noop} reason="Pick who it reaches." />);
    expect(buttons(out)[1]).toEqual({ text: "Continue", disabled: true, filled: true });
    expect(out).toContain("Pick who it reaches.");
    // "" still waits: the step's fields show their own errors
    expect(buttons(renderToStaticMarkup(<StepFooter step={1} total={3} name="Budget" onContinue={noop} reason="" />))[1].disabled).toBe(true);
    expect(buttons(renderToStaticMarkup(<StepFooter step={1} total={3} name="Budget" onContinue={noop} reason={null} />))[1].disabled).toBe(false);
  });

  it("gives Continue's place to the last step's own action", () => {
    const out = renderToStaticMarkup(<StepFooter step={3} total={3} name="Review" onBack={noop}><button>Add campaign</button></StepFooter>);
    expect(buttons(out).map((b) => b.text)).toEqual(["Back", "Add campaign"]);
  });

  it("draws Continue as an outline beside a filled action, so one button stays filled", () => {
    const out = renderToStaticMarkup(<StepFooter step={1} total={4} name="Topic" onContinue={noop} continueVariant="outline"><button className="bg-primary">Write it</button></StepFooter>);
    expect(buttons(out).filter((b) => b.filled).map((b) => b.text)).toEqual(["Write it"]);
  });
});
