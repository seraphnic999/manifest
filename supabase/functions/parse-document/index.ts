// Manifest — parse-document Edge Function
//
// Prototype for the Doc Tracker's "Claude agent instead of OCR" idea: given
// an already-uploaded travel_documents photo, read it directly with a
// vision-capable Claude call and return the structured fields for a human
// to review — same "propose, never write" shape as identify-item/
// research-item. Synchronous (one vision call, no search), so unlike
// research-item this responds directly rather than queuing a background job.
//
// This is an evaluation build: it does not write to travel_documents itself.
// The caller decides whether/how to apply the result.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";

// Same published Claude Sonnet 5 rates the other two agent functions use.
const USD_PER_INPUT_TOKEN = 2 / 1_000_000;
const USD_PER_CACHE_READ_TOKEN = 0.2 / 1_000_000;
const USD_PER_CACHE_WRITE_TOKEN = 2.5 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 10 / 1_000_000;

const SYSTEM = `You read a photo of a real travel document (passport, national ID, visa, driver's license, or similar) and return its printed fields, structured, for a human to review before anything is saved.

RULES

1. Transcribe exactly what is printed or stamped on the document. Never infer, complete, or "correct" a number, date, or name from context — a passport number is either legible or it isn't.
2. If the machine-readable zone (MRZ, the two lines of angle-bracket filler characters at the bottom of a passport/ID) is visible and legible, prefer it for the document number, name, nationality, and dates — it's the most error-resistant text on the page. Fall back to the printed/visual fields only if the MRZ is missing, cropped out, or unclear.
3. Dates go out as ISO (YYYY-MM-DD). If a date is printed in a different format (DD MMM YYYY, DD/MM/YYYY, etc.), convert it — but only when you're confident which field is day vs. month; if genuinely ambiguous, say so in the relevant basis field and lower confidence rather than guessing an order.
4. issuing_country is the country that issued the document (the passport's own country, or the visa-issuing country — e.g. a US visa's issuing_country is "USA" even if it's stamped inside a foreign passport). Always give the country's common full name or standard short name ("Israel", "USA", "United Kingdom") — never the bare 3-letter MRZ/ISO code (not "ISR", not "GBR"), even if that code is what the MRZ itself shows.
5. Confidence per field: "high" = clearly legible, unambiguous. "medium" = legible but with some uncertainty (glare, partial crop, a character that could be 0/O or 1/I). "low" = a guess from a barely-legible or partially obscured area. "none" = not visible in the photo at all — return null, don't guess.
6. If the photo is blurry, glared, cropped, or otherwise unsuitable for confident reading, say so plainly in the unresolved field rather than forcing an answer.
7. This is a real legal document belonging to the person who uploaded it — treat every field as something that will be checked against the physical document, not as a best-effort summary.

Call extract_document_fields exactly once, at the end. No prose.`;

const EXTRACT_TOOL = {
  name: "extract_document_fields",
  description: "Return the document's fields as read from the photo. Call exactly once.",
  input_schema: {
    type: "object",
    properties: {
      document_type: { type: "string", enum: ["passport", "national_id", "visa", "drivers_license", "other"], description: "What kind of document this is." },
      document_type_confidence: { type: "string", enum: ["high", "medium", "low", "none"] },

      document_number: { type: ["string", "null"], description: "The document/passport/visa number, exactly as printed (no spaces added)." },
      document_number_confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
      document_number_basis: { type: "string" },

      full_name: { type: ["string", "null"], description: "The holder's full name as printed, for cross-checking — not itself saved to the record." },
      full_name_confidence: { type: "string", enum: ["high", "medium", "low", "none"] },

      issuing_country: { type: ["string", "null"], description: "The country that issued this specific document." },
      issuing_country_confidence: { type: "string", enum: ["high", "medium", "low", "none"] },

      issue_date: { type: ["string", "null"], description: "ISO YYYY-MM-DD." },
      issue_date_confidence: { type: "string", enum: ["high", "medium", "low", "none"] },

      expiry_date: { type: ["string", "null"], description: "ISO YYYY-MM-DD." },
      expiry_date_confidence: { type: "string", enum: ["high", "medium", "low", "none"] },

      used_mrz: { type: "boolean", description: "Whether the machine-readable zone was visible and used as the primary source." },
      unresolved: { type: ["string", "null"], description: "Anything illegible, ambiguous, or missing from the photo, and why." },
    },
    required: ["document_type", "document_type_confidence", "unresolved", "used_mrz"],
  },
};

type Json = Record<string, any>;

interface Spend { input: number; cacheRead: number; cacheWrite: number; output: number; }
function costOf(s: Spend) {
  return s.input * USD_PER_INPUT_TOKEN + s.cacheRead * USD_PER_CACHE_READ_TOKEN
    + s.cacheWrite * USD_PER_CACHE_WRITE_TOKEN + s.output * USD_PER_OUTPUT_TOKEN;
}

function mediaTypeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic" || ext === "heif") return "image/heic";
  return "image/jpeg";
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  // deno-lint-ignore no-explicit-any
  return (globalThis as any).btoa(binary);
}

Deno.serve(async (req) => {
  // Two ways to point this at a photo:
  //  - document_id: the normal case — a travel_documents row already exists
  //    (created from a companion's own "+ Add document"), its photo_path is
  //    read from there.
  //  - photo_path: the Doc Tracker main-page "Add" flow, which scans a photo
  //    before any document (or even companion) row exists yet — the client
  //    uploads to a per-user "_pending" path first (see
  //    lib/travelDocuments.ts's uploadPendingDocumentPhoto) and passes that
  //    path directly, skipping the DB lookup below entirely.
  let documentId: string | undefined;
  let photoPath: string | undefined;
  try {
    const body = await req.json();
    documentId = body?.document_id;
    photoPath = body?.photo_path;
  } catch { /* fall through */ }
  if (!documentId && !photoPath) {
    return new Response(JSON.stringify({ error: "document_id or photo_path is required" }), { status: 400 });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY is not set on this project." }), { status: 500 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    if (documentId) {
      const { data: doc, error: docError } = await supabase.from("travel_documents").select("*").eq("id", documentId).single();
      if (docError || !doc) throw new Error("Document not found.");
      if (!doc.photo_path) throw new Error("This document has no photo to read.");
      photoPath = doc.photo_path;
    }

    const { data: file, error: downloadError } = await supabase.storage.from("travel-documents").download(photoPath!);
    if (downloadError || !file) throw new Error(`Could not load the document photo: ${downloadError?.message ?? "unknown error"}`);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mediaType = mediaTypeFromPath(photoPath!);
    const base64 = toBase64(bytes);

    const messages: Json[] = [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: "Read this travel document photo and call extract_document_fields with what you find." },
        ],
      },
    ];

    const started = Date.now();
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM,
        messages,
        tools: [EXTRACT_TOOL],
        tool_choice: { type: "tool", name: "extract_document_fields" },
      }),
    });
    const elapsedMs = Date.now() - started;

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Claude API ${res.status}: ${errBody.slice(0, 400)}`);
    }
    const resp = await res.json();

    const spend: Spend = {
      input: resp.usage?.input_tokens ?? 0,
      cacheRead: resp.usage?.cache_read_input_tokens ?? 0,
      cacheWrite: resp.usage?.cache_creation_input_tokens ?? 0,
      output: resp.usage?.output_tokens ?? 0,
    };

    const content: Json[] = resp.content ?? [];
    const call = content.find((c) => c.type === "tool_use" && c.name === "extract_document_fields");
    if (!call) throw new Error("The model did not return a usable record.");

    return new Response(
      JSON.stringify({
        extracted: call.input,
        cost_usd: Number(costOf(spend).toFixed(5)),
        usage: spend,
        elapsed_ms: elapsedMs,
        image_bytes: bytes.length,
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    console.error("parse-document failed", documentId ?? photoPath, e);
    return new Response(
      JSON.stringify({ error: String(e instanceof Error ? e.message : e).slice(0, 300) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});
