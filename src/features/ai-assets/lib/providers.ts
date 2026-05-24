import { parseQuotaHeaders, UNKNOWN_QUOTA } from "./quota";
import { imageSourceToProviderImage } from "./provider-utils";
import type {
  AiAssetProviderId,
  AiProviderGenerateRequest,
  AiProviderGenerateResult,
} from "@/types/integrations/ai-assets";

function getApiErrorMessage(fallback: string, error: unknown): string {
  if (!error || typeof error !== "object") return fallback;
  const maybeError = error as {
    error?: string | { message?: string };
    message?: string;
  };
  if (typeof maybeError.error === "string") return maybeError.error;
  if (typeof maybeError.error?.message === "string") {
    return maybeError.error.message;
  }
  if (typeof maybeError.message === "string") return maybeError.message;
  return fallback;
}

async function readJsonError(response: Response, fallback: string) {
  const error = await response.json().catch(() => null);
  throw new Error(getApiErrorMessage(fallback, error));
}

async function generateOpenAI({
  apiKey,
  model,
  prompt,
  count,
  width,
  height,
  initImageB64,
  initImageMime,
}: AiProviderGenerateRequest): Promise<AiProviderGenerateResult> {
  const dataUrls: string[] = [];
  const targetDimensions = { width, height };

  if (initImageB64 && initImageMime) {
    const editDataUrls = await Promise.all(
      Array.from({ length: count }, async () => {
        const form = new FormData();
        const byteStr = atob(initImageB64);
        const bytes = new Uint8Array(byteStr.length);
        for (let index = 0; index < byteStr.length; index += 1) {
          bytes[index] = byteStr.charCodeAt(index);
        }
        form.append(
          "image",
          new Blob([bytes], { type: initImageMime }),
          "reference.png",
        );
        form.append("prompt", prompt);
        form.append("model", model);
        form.append("n", "1");
        form.append("size", `${width}x${height}`);
        form.append("response_format", "b64_json");
        const response = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        });
        if (!response.ok) {
          await readJsonError(response, `OpenAI error ${response.status}`);
        }
        const data = (await response.json()) as {
          data: { b64_json: string }[];
        };
        return data.data.map((image) => `data:image/png;base64,${image.b64_json}`);
      }),
    );
    dataUrls.push(...editDataUrls.flat());
  } else {
    const response = await fetch(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
          n: count,
          size: `${width}x${height}`,
          response_format: "b64_json",
        }),
      },
    );
    if (!response.ok) {
      await readJsonError(response, `OpenAI error ${response.status}`);
    }
    const data = (await response.json()) as { data: { b64_json: string }[] };
    dataUrls.push(
      ...data.data.map((image) => `data:image/png;base64,${image.b64_json}`),
    );
  }

  return {
    images: await Promise.all(
      dataUrls.map((url) =>
        imageSourceToProviderImage(url, {
          fallbackMimeType: "image/png",
          targetDimensions,
        }),
      ),
    ),
    quota: UNKNOWN_QUOTA,
  };
}

async function generateGemini({
  apiKey,
  model,
  prompt,
  ratio,
  initImageB64,
  initImageMime,
  count,
  width,
  height,
}: AiProviderGenerateRequest): Promise<AiProviderGenerateResult> {
  const targetDimensions = { width, height };

  return {
    images: await Promise.all(
      Array.from({ length: count }, async () => {
        const parts: unknown[] = [];
        if (initImageB64 && initImageMime) {
          parts.push({
            inline_data: { mime_type: initImageMime, data: initImageB64 },
          });
        }
        parts.push({ text: prompt });

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts }],
              generationConfig: {
                responseModalities: ["IMAGE"],
                imageConfig: { aspectRatio: ratio },
              },
            }),
          },
        );
        if (!response.ok) {
          await readJsonError(response, `Gemini error ${response.status}`);
        }

        const data = (await response.json()) as {
          candidates?: {
            content?: {
              parts?: {
                inlineData?: { data: string; mimeType: string };
                thought?: boolean;
              }[];
            };
          }[];
        };
        const imagePart = data.candidates
          ?.flatMap((candidate) => candidate.content?.parts ?? [])
          .find((part) => part.inlineData && !part.thought);
        if (!imagePart?.inlineData) {
          throw new Error("Gemini returned no image");
        }

        return imageSourceToProviderImage(
          `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
          {
            fallbackMimeType: imagePart.inlineData.mimeType,
            targetDimensions,
          },
        );
      }),
    ),
    quota: UNKNOWN_QUOTA,
  };
}

async function generateTogether({
  apiKey,
  model,
  prompt,
  count,
  width,
  height,
}: AiProviderGenerateRequest): Promise<AiProviderGenerateResult> {
  const targetDimensions = { width, height };
  const response = await fetch(
    "https://api.together.xyz/v1/images/generations",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        n: count,
        width,
        height,
        response_format: "base64",
      }),
    },
  );
  if (!response.ok) {
    await readJsonError(response, `Together AI error ${response.status}`);
  }
  const data = (await response.json()) as {
    data: { b64_json?: string; url?: string }[];
  };
  return {
    images: await Promise.all(
      data.data.map((image) =>
        imageSourceToProviderImage(
          image.b64_json
            ? `data:image/jpeg;base64,${image.b64_json}`
            : (image.url ?? ""),
          {
            fallbackMimeType: "image/jpeg",
            targetDimensions,
          },
        ),
      ),
    ),
    quota: UNKNOWN_QUOTA,
  };
}

async function generateXAI({
  apiKey,
  model,
  prompt,
  count,
  width,
  height,
}: AiProviderGenerateRequest): Promise<AiProviderGenerateResult> {
  const targetDimensions = { width, height };
  const response = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, prompt, n: count }),
  });
  if (!response.ok) {
    await readJsonError(response, `xAI error ${response.status}`);
  }
  const data = (await response.json()) as { data: { url: string }[] };
  return {
    images: await Promise.all(
      data.data.map((image) =>
        imageSourceToProviderImage(image.url, { targetDimensions }),
      ),
    ),
    quota: UNKNOWN_QUOTA,
  };
}

function buildHuggingFaceRoute(model: string): string {
  const [modelId, provider = "hf-inference"] = model.split(":");
  const encodedModel = (modelId ?? model)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://router.huggingface.co/${provider}/models/${encodedModel}`;
}

const HUGGING_FACE_IMAGE_ACCEPT = "image/png";

async function generateHuggingFace({
  apiKey,
  model,
  prompt,
  count,
  width,
  height,
}: AiProviderGenerateRequest): Promise<AiProviderGenerateResult> {
  const images = [];
  let quota = UNKNOWN_QUOTA;
  const targetDimensions = { width, height };

  for (let index = 0; index < count; index += 1) {
    const response = await fetch(buildHuggingFaceRoute(model), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: HUGGING_FACE_IMAGE_ACCEPT,
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          width,
          height,
        },
      }),
    });
    quota = parseQuotaHeaders(response.headers);
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const error = (() => {
        if (!errorText) return null;
        try {
          return JSON.parse(errorText) as unknown;
        } catch {
          return { message: errorText };
        }
      })();
      throw new Error(
        getApiErrorMessage(`Hugging Face error ${response.status}`, error),
      );
    }
    images.push(
      await imageSourceToProviderImage(await response.blob(), {
        fallbackMimeType: HUGGING_FACE_IMAGE_ACCEPT,
        targetDimensions,
      }),
    );
  }

  return { images, quota };
}

export function generateWithProvider(
  provider: AiAssetProviderId,
  request: AiProviderGenerateRequest,
): Promise<AiProviderGenerateResult> {
  switch (provider) {
    case "huggingface":
      return generateHuggingFace(request);
    case "openai":
      return generateOpenAI(request);
    case "gemini":
      return generateGemini(request);
    case "together":
      return generateTogether(request);
    case "xai":
      return generateXAI(request);
  }
}
