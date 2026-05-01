import { assert, test } from "vitest";
import { parseDataUrl } from "@/features/ai-assets/lib/image-utils";

test("parses data URLs with mime fallback", () => {
  assert.deepEqual(parseDataUrl("data:image/webp;base64,abc123"), {
    b64: "abc123",
    mime: "image/webp",
  });
  assert.deepEqual(parseDataUrl("abc123"), {
    b64: "",
    mime: "image/png",
  });
});
