const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

type NumberState = "none" | "afterOnes" | "afterTens" | "afterHundred";

/**
 * Converts spoken number words into digits, e.g. "twenty six" -> "26", "one hundred
 * seventy six" -> "176", "twenty-six" (STT sometimes hyphenates compounds) -> "26".
 * Deliberately does NOT merge two adjacent ones/teens words ("five eleven" stays "5 11")
 * since that pattern is two separate numbers (a height reading), not one compound number
 * — only tens+ones and hundred-scaling combine.
 */
export const normalizeSpokenNumbers = (text: string): string => {
  // split on whitespace AND hyphens — STT often renders compounds as "seventy-six"
  const tokens = text.split(/[\s-]+/);
  const out: string[] = [];
  let current = 0;
  let hasValue = false;
  let state: NumberState = "none";

  const flush = () => {
    if (hasValue) out.push(String(current));
    current = 0;
    hasValue = false;
    state = "none";
  };

  for (const token of tokens) {
    const clean = token.toLowerCase().replace(/[^a-z]/g, "");

    if (clean === "and") {
      // filler inside a number phrase: "one hundred and eighty" -> don't break the chain
      if (hasValue) continue;
      flush();
      out.push(token);
      continue;
    }

    if (clean === "hundred") {
      if (hasValue) {
        current = (current || 1) * 100;
      } else {
        current = 100;
      }
      hasValue = true;
      state = "afterHundred";
      continue;
    }

    if (clean in TENS) {
      if (state === "afterHundred") {
        current += TENS[clean];
      } else if (state === "afterOnes" && current >= 1 && current <= 9) {
        // colloquial 3-digit reading without "hundred": "one seventy six" -> 176
        current = current * 100 + TENS[clean];
      } else {
        flush();
        current = TENS[clean];
      }
      hasValue = true;
      state = "afterTens";
      continue;
    }

    if (clean in ONES) {
      if (state === "afterHundred" || state === "afterTens") {
        current += ONES[clean];
      } else {
        flush();
        current = ONES[clean];
      }
      hasValue = true;
      state = "afterOnes";
      continue;
    }

    flush();
    out.push(token);
  }
  flush();

  return out.join(" ");
};
