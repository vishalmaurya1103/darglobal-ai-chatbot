import { describe, expect, it } from "vitest";
import { classifySmallTalk, looksLikeFollowUp, OUT_OF_SCOPE_REPLY, previousQuestion, SMALL_TALK_REPLIES } from "./intent";

const user = (content: string) => ({ role: "user" as const, content });
const assistant = (content: string) => ({ role: "assistant" as const, content });

describe("classifySmallTalk", () => {
  it.each([
    ["hi", "greeting"],
    ["Hello there!", "greeting"],
    ["Good evening", "greeting"],
    ["Salam alaikum", "greeting"],
    ["Assalamualaikum", "greeting"],
    ["مرحبا", "greeting"],
    ["thanks a lot", "thanks"],
    ["Ok thank you!", "thanks"],
    ["What can you do?", "help"],
    ["who are you", "help"],
  ])("classifies %j as %s", (text, expected) => {
    expect(classifySmallTalk(text)).toBe(expected);
  });

  it.each(["hi, show me villas in Riyadh", "Thanks, and what about Jeddah?", "help me find a 3 bedroom flat", "Hilton residences"])(
    "leaves a real question alone: %j",
    (text) => {
      expect(classifySmallTalk(text)).toBeNull();
    },
  );
});

describe("previousQuestion", () => {
  it("returns the user's last question before the current one", () => {
    expect(previousQuestion([user("first"), assistant("..."), user("second"), assistant("..."), user("now")])).toBe("second");
  });

  it("is null at the start of a conversation", () => {
    expect(previousQuestion([user("now")])).toBeNull();
  });
});

describe("looksLikeFollowUp", () => {
  it.each(["What amenities does it have?", "And the payment plan?", "Which one is the cheapest?", "Anything cheaper", "in Jeddah?"])(
    "recognises %j",
    (question) => {
      expect(looksLikeFollowUp(question)).toBe(true);
    },
  );

  it("treats a complete question as standing alone", () => {
    expect(looksLikeFollowUp("Which DarGlobal projects are in Oman and when is completion?")).toBe(false);
  });
});

describe("fixed replies", () => {
  it("offer example questions the user can ask instead", () => {
    for (const reply of [OUT_OF_SCOPE_REPLY, SMALL_TALK_REPLIES.greeting, SMALL_TALK_REPLIES.help]) {
      expect(reply).toMatch(/^- .+\?$/m);
    }
  });
});
