/**
 * Example questions, shown as starters on the empty screen and offered in the
 * assistant's own replies. Each fits on two lines of a starter card. Chosen to exercise each retrieval path: semantic
 * search over project pages, filtered search over listings, and SQL analytics.
 */
export const EXAMPLE_GROUPS = [
  {
    id: "darglobal",
    label: "DarGlobal projects",
    questions: [
      "What amenities does Trump Tower Jeddah offer?",
      "When do the DarGlobal projects in Dubai complete?",
    ],
  },
  {
    id: "wasalt",
    label: "Wasalt listings",
    questions: ["3 bedroom apartments for sale in Jeddah under 1M", "Show me villas for rent in Riyadh"],
  },
  {
    id: "analytics",
    label: "Across the data",
    questions: ["How many DarGlobal projects are in Oman?", "What is the cheapest villa for sale in Riyadh?"],
  },
] as const;

export type ExampleGroupId = (typeof EXAMPLE_GROUPS)[number]["id"];
