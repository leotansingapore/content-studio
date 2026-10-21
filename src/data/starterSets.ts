// The 8 starter media sets (brand-media-sets), chosen for Singapore advisers' posts: plain names, portrait Pexels
// searches, each added by addStarter in src/lib/mediaSets.ts as an even share of every query.

export interface StarterSet {
  id: string;
  name: string;
  kind: "photos" | "clips";
  count: number;
  queries: string[];
}

export const STARTER_SETS: StarterSet[] = [
  { id: "money", name: "Money and budgeting", kind: "photos", count: 12, queries: ["saving money jar", "budget planner notebook", "paying bills calculator"] },
  { id: "family", name: "Family and home", kind: "photos", count: 12, queries: ["family at home", "parents with children", "family dinner table"] },
  { id: "singapore", name: "Singapore city", kind: "photos", count: 12, queries: ["singapore skyline", "singapore street", "singapore hdb flats"] },
  { id: "work", name: "Work and career", kind: "photos", count: 12, queries: ["young professional office", "laptop desk work", "team meeting office"] },
  { id: "later-life", name: "Later life", kind: "photos", count: 12, queries: ["retired couple", "grandparents and grandchildren", "senior couple walking"] },
  { id: "health", name: "Health and fitness", kind: "photos", count: 12, queries: ["running outdoors", "gym workout", "healthy breakfast"] },
  { id: "city-clips", name: "City clips", kind: "clips", count: 8, queries: ["singapore city", "city night traffic"] },
  { id: "everyday-clips", name: "Everyday clips", kind: "clips", count: 8, queries: ["coffee morning", "typing on laptop", "walking in the city"] },
];
