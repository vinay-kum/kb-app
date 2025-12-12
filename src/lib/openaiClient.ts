import { ChatMessage, KnowledgeFile, Settings } from "@/types";

const API_BASE = "https://api.openai.com/v1";

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

const ensureSettings = (settings: Settings) => {
  if (!settings.apiKey) throw new Error("Missing API key");
  if (!settings.vectorStoreId) throw new Error("Missing vector store id");
};

const authHeaders = (apiKey: string, extra?: Record<string, string>): HeadersInit => ({
  Authorization: `Bearer ${apiKey}`,
  ...(extra ?? {})
});

const handleResponse = async <T>(res: Response): Promise<ApiResult<T>> => {
  if (res.ok) {
    const json = (await res.json()) as T;
    return { ok: true, data: json };
  }

  let message = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    message = body.error?.message ?? message;
  } catch {
    // ignore parse errors
  }
  return { ok: false, error: message };
};

export async function createVectorStore(name: string, settings: Settings) {
  if (!name.trim()) throw new Error("Vector store name is required");
  if (!settings.apiKey) throw new Error("API key required");

  const res = await fetch(`${API_BASE}/vector_stores`, {
    method: "POST",
    headers: authHeaders(settings.apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify({ name })
  });

  return handleResponse<{ id: string; name: string }>(res);
}

export async function listFiles(settings: Settings): Promise<ApiResult<KnowledgeFile[]>> {
  try {
    ensureSettings(settings);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const res = await fetch(
    `${API_BASE}/vector_stores/${settings.vectorStoreId}/files?limit=100`,
    { headers: authHeaders(settings.apiKey) }
  );
  const parsed = await handleResponse<{ data: any[] }>(res);
  if (!parsed.ok) return parsed;

  const items = await Promise.all(
    parsed.data.data.map(async (item) => {
      let file: KnowledgeFile = {
        id: item.id,
        filename: item.filename ?? item.file_id ?? item.id,
        bytes: item.usage_bytes ?? 0,
        status: item.status ?? "unknown",
        created_at: item.created_at ?? Date.now(),
        metadata: item.metadata ?? {}
      };

      try {
        const detailRes = await fetch(`${API_BASE}/files/${item.file_id ?? item.id}`, {
          headers: authHeaders(settings.apiKey)
        });
        if (detailRes.ok) {
          const detail = await detailRes.json();
          file = {
            ...file,
            filename: detail.filename ?? file.filename,
            bytes: detail.bytes ?? file.bytes,
            metadata: detail.metadata ?? file.metadata,
            created_at: detail.created_at ?? file.created_at
          };
        }
      } catch {
        // Non-blocking
      }

      return file;
    })
  );

  return { ok: true, data: items };
}

export async function uploadFile(file: File, settings: Settings): Promise<ApiResult<KnowledgeFile>> {
  try {
    ensureSettings(settings);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const form = new FormData();
  form.append("file", file);
  form.append("purpose", "assistants");

  const uploadRes = await fetch(`${API_BASE}/files`, {
    method: "POST",
    headers: authHeaders(settings.apiKey),
    body: form
  });
  const uploaded = await handleResponse<{ id: string }>(uploadRes);
  if (!uploaded.ok) return uploaded;

  const attachRes = await fetch(
    `${API_BASE}/vector_stores/${settings.vectorStoreId}/files`,
    {
      method: "POST",
      headers: authHeaders(settings.apiKey, { "Content-Type": "application/json" }),
      body: JSON.stringify({ file_id: uploaded.data.id })
    }
  );
  const attached = await handleResponse<any>(attachRes);
  if (!attached.ok) return attached;

  const knowledgeFile: KnowledgeFile = {
    id: attached.data.id ?? uploaded.data.id,
    filename: file.name,
    bytes: attached.data.usage_bytes ?? file.size,
    status: attached.data.status ?? "in_progress",
    created_at: attached.data.created_at ?? Date.now()
  };

  return { ok: true, data: knowledgeFile };
}

export async function deleteFile(fileId: string, settings: Settings): Promise<ApiResult<boolean>> {
  try {
    ensureSettings(settings);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const res = await fetch(
    `${API_BASE}/vector_stores/${settings.vectorStoreId}/files/${fileId}`,
    {
      method: "DELETE",
      headers: authHeaders(settings.apiKey)
    }
  );

  const parsed = await handleResponse<{ id: string }>(res);
  if (!parsed.ok) return parsed;
  return { ok: true, data: true };
}

export async function replaceFile(
  existingFileId: string,
  nextFile: File,
  settings: Settings
): Promise<ApiResult<KnowledgeFile>> {
  const uploaded = await uploadFile(nextFile, settings);
  if (!uploaded.ok) return uploaded;

  await deleteFile(existingFileId, settings);
  return uploaded;
}

const toText = (value: any): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => toText(v)).join("\n");
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("output_text" in value && typeof value.output_text === "string") return value.output_text;
    if ("summary" in value && typeof value.summary === "string") return value.summary;
    if ("content" in value) return toText((value as any).content);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[unreadable content]";
  }
};

export async function askQuestion(
  question: string,
  chatHistory: ChatMessage[],
  settings: Settings
): Promise<ApiResult<ChatMessage>> {
  if (!question.trim()) return { ok: false, error: "Question is empty" };
  try {
    ensureSettings(settings);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const payload = {
    model: settings.model || "gpt-4o-mini",
    input: [
      ...chatHistory.map((message) => ({
        role: message.role,
        content: [
          {
            type: message.role === "assistant" ? "output_text" : "input_text",
            text: message.content
          }
        ]
      })),
      { role: "user", content: [{ type: "input_text", text: question }] }
    ],
    tools: [{ type: "file_search", vector_store_ids: [settings.vectorStoreId] }]
  };

  const res = await fetch(`${API_BASE}/responses`, {
    method: "POST",
    headers: authHeaders(settings.apiKey, {
      "Content-Type": "application/json",
      "OpenAI-Beta": "assistants=v2"
    }),
    body: JSON.stringify(payload)
  });

  const parsed = await handleResponse<any>(res);
  if (!parsed.ok) return parsed;

  const outputArray = Array.isArray(parsed.data.output) ? parsed.data.output : [];
  const messageBlock = outputArray.find((entry: any) => entry.type === "message");
  const messageContent = Array.isArray(messageBlock?.content)
    ? messageBlock.content.find((c: any) => c.type === "output_text") ?? messageBlock.content[0]
    : undefined;

  const outputEntry =
    messageContent ??
    outputArray.find((entry: any) => entry.type === "output_text") ??
    parsed.data.output_text ??
    parsed.data.output;

  const rawContent =
    toText(outputEntry) ||
    toText(parsed.data.output_text) ||
    toText(parsed.data.response) ||
    toText(parsed.data.result) ||
    toText(parsed.data.text) ||
    "No response";

  const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

  return {
    ok: true,
    data: {
      id: parsed.data.id ?? crypto.randomUUID(),
      role: "assistant",
      content,
      createdAt: Date.now()
    }
  };
}
