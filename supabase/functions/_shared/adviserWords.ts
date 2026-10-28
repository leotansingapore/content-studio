// For tests: the adviser framing a prompt written for any other profession must not carry.
const ADVISER_WORDS =
  /\b([Cc]onsultants?|[Aa]dvis[eo]rs?|[Ff]inanc\w*|[Ii]nsur\w*|[Pp]olic(y|ies)|Singapore\w*|MediShield|MediSave|CareShield|CPF|ILPs?|MAS|HDB|BTO|SRS|SGD?|FC|AIA|[Mm]oney|[Rr]etirement)\b/g;

/** Every adviser word in `text`, once each. */
export const adviserWordsIn = (text: string): string[] => [...new Set(text.match(ADVISER_WORDS) ?? [])];

export const PROFESSIONS = [
  { raw: "Coach", said: "coach" },
  { raw: "Real estate agent", said: "real estate agent" },
] as const;
