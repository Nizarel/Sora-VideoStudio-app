import { NextResponse } from "next/server";
import { AzureOpenAI } from "openai";
import { describeError, resolveErrorStatus, isRecord } from "@/lib/sora";
import { DEFAULT_TITLE_MODEL, extractTitleFromResponse } from "@/utils/titles";

export async function POST(request: Request) {
  const apiKey = process.env.AZURE_OPENAI_API_KEY?.trim();
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  // Allow per-feature override for titles if a newer preview version is required.
  const apiVersion =
    process.env.AZURE_OPENAI_API_VERSION_TITLES?.trim()
      || process.env.AZURE_OPENAI_API_VERSION?.trim()
      || "2025-03-01-preview"; // Responses API requires 2025-03-01-preview or later
  const deployment =
    process.env.AZURE_OPENAI_TITLE_DEPLOYMENT?.trim() ?? DEFAULT_TITLE_MODEL;

  if (!apiKey || !endpoint) {
    const message =
      "AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT must be configured";
    return NextResponse.json({ error: { message } }, { status: 500 });
  }

  const client = new AzureOpenAI({
    apiKey,
    endpoint,
    deployment,
    apiVersion,
  });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON payload" } },
      { status: 400 }
    );
  }

  const prompt =
    typeof (payload as { prompt?: unknown })?.prompt === "string"
      ? (payload as { prompt: string }).prompt.trim()
      : "";
  if (!prompt) {
    return NextResponse.json(
      { error: { message: "Prompt is required" } },
      { status: 400 }
    );
  }

  // Build the prompt content once
  const userContent = `Propose a short reel-style title for this video prompt (don't include quotes around the title): ${prompt}`;

  // First attempt: Responses API (only valid for api-version >= 2025-03-01-preview)
  try {
    const responsesResult = await client.responses.create({
      model: deployment,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: userContent,
            },
          ],
        },
      ],
      max_output_tokens: 80,
    });
    return NextResponse.json(responsesResult);
  } catch (primaryError) {
    const status = resolveErrorStatus(primaryError);
    const message = describeError(primaryError, "Primary title generation failed");
    const isVersionGate = isRecord(primaryError) && typeof (primaryError as { status?: number }).status === "number" && status === 400;
    const isNotFound = status === 404;
    // Fallback on 404 (missing surface) or 400 (version gate) conditions.
    if (!isNotFound && !isVersionGate) {
      console.error("Azure OpenAI Responses API failed", primaryError);
      return NextResponse.json({ error: { message } }, { status });
    }
    console.warn("Responses API fallback pathway", { message, deployment, endpoint, status });
  }

  // Fallback: chat/completions endpoint (raw fetch) for resources exposing only that surface.
  try {
    const body = {
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
      model: deployment,
      max_completion_tokens: 80,
    };

    const chatUrl = `${endpoint.replace(/\/*$/, "")}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
    const chatResponse = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(body),
    });

    const text = await chatResponse.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }

    if (!chatResponse.ok) {
      const fallbackMessage = isRecord(parsed) && typeof (parsed as { error?: { message?: string } })?.error?.message === "string"
        ? (parsed as { error: { message: string } }).error.message
        : chatResponse.statusText || "Chat completions request failed";
      console.error("Azure OpenAI chat/completions failed", { status: chatResponse.status, body: parsed });
      return NextResponse.json({ error: { message: fallbackMessage } }, { status: chatResponse.status });
    }

    // Normalize to similar structure expected by client (provide output_text if missing)
    const augmented: Record<string, unknown> = isRecord(parsed) ? parsed as Record<string, unknown> : { payload: parsed };
    const title = extractTitleFromResponse(augmented as unknown as { output_text?: string[] });
    const outputText = Array.isArray((augmented as { output_text?: unknown }).output_text)
      ? (augmented as { output_text: unknown }).output_text as string[]
      : [];
    if (title && outputText.length === 0) {
      (augmented as { output_text?: string[] }).output_text = [title];
    }
    return NextResponse.json(augmented);
  } catch (fallbackError) {
    const message = describeError(fallbackError, "Failed to generate title (fallback)");
    const status = resolveErrorStatus(fallbackError);
    return NextResponse.json({ error: { message } }, { status });
  }
}
