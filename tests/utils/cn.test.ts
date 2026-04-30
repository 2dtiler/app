import { assert, test } from "vitest";
import { cn } from "@/utils/cn";

test("merges conditional and conflicting class names", () => {
  const hiddenClass = false;

  assert.equal(
    cn("px-2", hiddenClass, ["text-sm", "px-4"], {
      block: true,
      invisible: false,
    }),
    "text-sm px-4 block",
  );
});
