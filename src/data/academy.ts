// Academy — a short curated course of real YouTube videos on creating social
// content with AI. Video IDs were verified against their live watch pages.

export interface AcademyLesson {
  youtubeId: string;
  title: string;
  channel: string;
  why: string;
}

export interface AcademyModule {
  title: string;
  blurb: string;
  lessons: AcademyLesson[];
}

export const ACADEMY: AcademyModule[] = [
  {
    title: "1. AI content foundations",
    blurb:
      "Set up ChatGPT and custom GPTs to write in your voice and generate posts and hooks fast.",
    lessons: [
      {
        youtubeId: "0Q1AQAxpdGg",
        title: "How to Create Custom GPT | OpenAI Tutorial",
        channel: "Kevin Stratvert",
        why: "Build a reusable custom GPT so you stop re-typing prompts and get on-brand output every time.",
      },
      {
        youtubeId: "zknXJ0w2JqM",
        title: "1-Minute ChatGPT Hack To Write In Your Brand Voice & Style",
        channel: "Andrew Lane | Design Hacker",
        why: "A fast way to make AI copy sound like you instead of generic AI.",
      },
      {
        youtubeId: "4B9VMQFrKQE",
        title: "Using ChatGPT to Create Brand Voice Guidelines",
        channel: "Brittany Miller",
        why: "Turn a fuzzy brand voice into concrete guidelines the AI can follow for consistent posts.",
      },
      {
        youtubeId: "Z00pG-n0_4Y",
        title: "Write Hooks with these ChatGPT Prompts",
        channel: "Owen Video",
        why: "Copy-paste prompts to generate scroll-stopping hooks for videos and posts.",
      },
    ],
  },
  {
    title: "2. Carousels & visual posts",
    blurb:
      "Turn one idea into finished LinkedIn and Instagram carousels using ChatGPT plus Canva.",
    lessons: [
      {
        youtubeId: "zOUwx0JZ8jQ",
        title: "How to Create a Carousel for LinkedIn — Canva + ChatGPT",
        channel: "Imran Siddiq - Web Squadron",
        why: "End-to-end: write carousel copy in ChatGPT and design it free in Canva.",
      },
      {
        youtubeId: "kE5nPo5hWlE",
        title: "Make LinkedIn Carousels Entirely by AI with ChatGPT and Canva",
        channel: "Cody Schneider",
        why: "A near-automated pipeline for producing LinkedIn carousels at volume.",
      },
      {
        youtubeId: "uTkrnGw3F1U",
        title: "How to Create an Instagram Carousel using Canva and ChatGPT",
        channel: "Paul and Code",
        why: "Adapts the carousel workflow for Instagram formatting and sizing.",
      },
      {
        youtubeId: "-tnTQvnVrN8",
        title: "One-Click Instagram Carousel with ChatGPT and AIPRM",
        channel: "SaaS Junction",
        why: "Shows how prompt tooling can speed carousel drafting to almost one click.",
      },
    ],
  },
  {
    title: "3. Systems & scaling",
    blurb:
      "Build a repeatable content system and repurpose one idea into a week of posts across platforms.",
    lessons: [
      {
        youtubeId: "PcRLelYga_o",
        title: "Use ChatGPT to Create a Complete Social Media Strategy",
        channel: "Marketing With Dev",
        why: "Build a full content strategy and calendar with ChatGPT so posting becomes systematic.",
      },
      {
        youtubeId: "ZHpRCZx6BWI",
        title: "How to Repurpose Content for Social Media (ChatGPT + Claude)",
        channel: "BelovedDigital",
        why: "Repurpose one core idea into many platform-native posts using ChatGPT and Claude.",
      },
      {
        youtubeId: "a-qbvUtJecg",
        title: "How Justin Welsh Built a $5M One-Person Business",
        channel: "Lucas Prigge",
        why: "A solo creator's content operating system you can model.",
      },
      {
        youtubeId: "t1yl1OUoJko",
        title: "This Will 10x Your Personal Brand in 2026 (ft. Dan Koe)",
        channel: "THE 505 PODCAST",
        why: "Big-picture personal-brand and content-system thinking to sustain output long term.",
      },
    ],
  },
];
