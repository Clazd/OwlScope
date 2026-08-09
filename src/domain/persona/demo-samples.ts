/**
 * Twenty writing samples for the demo persona, so the fingerprint path can be
 * exercised end to end in sandbox mode without the user pasting anything.
 *
 * They are written to have a consistent, detectable signature: short sentences,
 * no em dashes, no semicolons, no emoji, no hashtags, concrete openings, and a
 * habit of claim-then-example with no closing call to action. That is the point
 * — a fingerprint derived from mush would not demonstrate anything.
 */
export const DEMO_SAMPLES_MINE: string[] = [
  "Spent the morning reading the diff instead of the README. The README said the cache was optional. The diff said it was load-bearing. Guess which one shipped.",
  "Most AI product demos fail at the same place. They show the happy path and skip the part where the model returns something malformed. That part is the product.",
  "A good error message is worth more than a good landing page. Nobody reads the landing page twice.",
  "Shipped a change that deleted 400 lines and added 30. The reviewer asked what feature it added. None. That was the feature.",
  "The constraint that made the tool good was refusing to add a second database. Everything got simpler downstream.",
  "Watched someone debug for an hour before checking whether the file had saved. I have done this. Everyone has done this.",
  "Open weights matter less for the weights and more for what people build once nobody has to ask permission.",
  "There is a version of every tool that is 20 percent as capable and 5 percent as complicated. It is usually the one people keep using.",
  "Read a postmortem where the root cause was a retry loop with no backoff. The incident lasted four hours. The fix was two lines.",
  "Benchmarks measure what is easy to measure. That is not an argument against benchmarks. It is an argument for reading what they left out.",
  "The best code review I got was one question. Why is this a class. It was not a class by the end of the day.",
  "Local-first software is not nostalgia. It is a bet that your data outlives the company that stored it.",
  "Tried three note apps this year. Went back to a folder of text files. The folder does not have a roadmap.",
  "A model that says I do not know is more useful than one that is right slightly more often and never says it.",
  "Every abstraction has a bill. Sometimes you pay it on day one. Usually you pay it in month eight, when someone new needs to change it.",
  "Saw a startup describe its product as an operating system for something that was clearly a spreadsheet. The spreadsheet was fine.",
  "The thing that made the migration survivable was writing the rollback first. We never used it. That is not the point.",
  "Small tools compose. Large tools integrate. Integration is what you call composition after it stopped working.",
  "Someone asked why the pipeline has a budget meter. Because the alternative is finding out at the end of the month.",
  "Writing the test first felt slow for about a week. Then it stopped feeling like anything at all.",
];

/**
 * A handful of admired samples, kept separate so it stays visible that they are
 * cadence reference only and never a source of opinions.
 */
export const DEMO_SAMPLES_ADMIRED: string[] = [
  "The interesting question is not whether it works. It is what it costs to keep working.",
  "You can tell a lot about a system by what it does when it is overloaded.",
];
