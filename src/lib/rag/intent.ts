import { EXAMPLE_GROUPS } from "../examples";
import type { ChatMessage } from "../types";

/**
 * Decides what kind of message arrived before any retrieval or model work.
 *
 * Small talk and clearly unrelated questions get a fixed reply. That keeps the
 * answer honest (no unrelated source cards), instant, and free: the free model
 * quota is account-wide, so it is not spent on "hi" or "tell me a joke".
 */

export type SmallTalk = "greeting" | "thanks" | "help";

const SMALL_TALK: [SmallTalk, RegExp][] = [
  [
    "greeting",
    /^(?:hi+|hello|hey|hiya|howdy|greetings|good (?:morning|afternoon|evening)|(?:as[- ]?)?sala+mu?(?: ?(?:alaikum|alaykum))?|marhaba|مرحبا|السلام عليكم)(?: there| all| everyone)?$/,
  ],
  ["thanks", /^(?:(?:ok(?:ay)? |great |perfect )?(?:thanks|thank you|thx|ty|cheers)(?: (?:so much|a lot|very much))?|شكرا)$/],
  [
    "help",
    /^(?:help|who are you|what are you|what can you do|what can i ask(?: you)?|how does this work|what do you know|how can you help(?: me)?)$/,
  ],
];

/** Recognises a message that is only a greeting, a thank-you or a request for help. */
export function classifySmallTalk(text: string): SmallTalk | null {
  const normalized = text
    .toLowerCase()
    .replace(/[!?.,،؟]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return SMALL_TALK.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
}

/**
 * Cosine similarity between a question and its closest indexed passage, below
 * which the question is treated as unrelated to the knowledge base.
 *
 * Calibrated on `eval/scope.json` (re-run with `npm run eval`): unrelated
 * questions ("tell me a joke", "capital of France") top out at 0.49, and real
 * property questions start at 0.54. Unrelated questions that name a real place
 * ("weather in Riyadh", 0.62) overlap with property questions and cannot be
 * separated by score, so they pass this gate and the model's prompt declines them.
 */
export const MIN_DOMAIN_SIMILARITY = 0.51;

// Words that only make sense with the previous question in mind ("is it ready?", "the cheaper one").
const REFERS_BACK =
  /\b(?:it|its|they|them|their|those|these|that|this|one|ones|cheaper|pricier|bigger|smaller|larger|another|other|same)\b/;
const CONTINUES = /^(?:and|also|what about|how about|what else)\b/;
const SHORT_QUESTION_WORDS = 4;

/** The user's previous question, if the conversation has one. */
export function previousQuestion(messages: ChatMessage[]): string | null {
  return messages.slice(0, -1).findLast((message) => message.role === "user")?.content ?? null;
}

/**
 * Whether a question reads as a follow-up. "What about its amenities?" means
 * nothing on its own; next to "Tell me about W Residences" it is a precise
 * query. This is a fast first guess - the pipeline also falls back to the
 * previous question before ever rejecting a message as unrelated.
 */
export function looksLikeFollowUp(question: string): boolean {
  const text = question.toLowerCase().trim();
  return text.split(/\s+/).length <= SHORT_QUESTION_WORDS || REFERS_BACK.test(text) || CONTINUES.test(text);
}

const CAPABILITIES =
  "I answer questions about **DarGlobal** developments and **Wasalt** property listings: amenities, locations, completion dates, prices and company news, using their public websites.";

const EXAMPLES = `You could ask:\n${EXAMPLE_GROUPS.map((group) => `- ${group.questions[0]}`).join("\n")}`;

export const SMALL_TALK_REPLIES: Record<SmallTalk, string> = {
  greeting: `Hello! ${CAPABILITIES}\n\n${EXAMPLES}`,
  help: `${CAPABILITIES} Every answer links back to the pages it came from.\n\n${EXAMPLES}`,
  thanks: "You're welcome. Ask me anything else about DarGlobal projects or Wasalt listings.",
};

export const OUT_OF_SCOPE_REPLY = `That is outside what I can help with. ${CAPABILITIES}\n\n${EXAMPLES}`;
