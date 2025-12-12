import { useEffect, useMemo, useState } from "react";
import {
  askQuestion,
  createVectorStore,
  deleteFile,
  listFiles,
  replaceFile,
  uploadFile
} from "@/lib/openaiClient";
import { loadSettings, persistSettings } from "@/lib/storage";
import { ChatMessage, KnowledgeFile, Settings } from "@/types";
import { formatBytes, formatDate } from "@/utils/format";

function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings());
  const [view, setView] = useState<"kb" | "config">("kb");
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatSending, setChatSending] = useState(false);

  const ready = useMemo(
    () => Boolean(settings.apiKey && settings.vectorStoreId),
    [settings]
  );

  useEffect(() => {
    if (!ready) return;
    refreshFiles();
  }, [ready, settings.apiKey, settings.vectorStoreId]);

  const refreshFiles = async () => {
    if (!ready) {
      setError("Add an API key and vector store to start.");
      return;
    }
    setFilesLoading(true);
    setError(null);
    const result = await listFiles(settings);
    setFilesLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFiles(result.data);
  };

  const handleSettingsSave = (next: Settings) => {
    setSettings(next);
    persistSettings(next);
    setToast("Settings saved locally.");
    setView("kb");
  };

  const handleUpload = async (file: File) => {
    if (!ready) return setError("Add API key and vector store first.");
    setUploading(true);
    setError(null);
    const result = await uploadFile(file, settings);
    setUploading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setToast(`Uploaded ${file.name}`);
    setFiles((prev) => [result.data, ...prev]);
  };

  const handleReplace = async (existingFileId: string, nextFile: File) => {
    if (!ready) return setError("Add API key and vector store first.");
    setUploading(true);
    const result = await replaceFile(existingFileId, nextFile, settings);
    setUploading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFiles((prev) => [result.data, ...prev.filter((f) => f.id !== existingFileId)]);
    setToast(`Updated ${nextFile.name}`);
  };

  const handleDelete = async (fileId: string) => {
    if (!ready) return setError("Add API key and vector store first.");
    const confirm = window.confirm("Delete this file from the vector store?");
    if (!confirm) return;

    const result = await deleteFile(fileId, settings);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFiles((prev) => prev.filter((file) => file.id !== fileId));
    setToast("File deleted.");
  };

  const handleAsk = async (question: string) => {
    if (!ready) {
      setError("Add API key and vector store first.");
      return;
    }
    const trimmed = question.trim();
    if (!trimmed) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      createdAt: Date.now()
    };

    setChatMessages((prev) => [...prev, userMessage]);
    setChatSending(true);
    const result = await askQuestion(trimmed, [...chatMessages, userMessage], settings);
    setChatSending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setChatMessages((prev) => [...prev, result.data]);
  };

  const handleCreateVectorStore = async (name: string) => {
    if (!settings.apiKey) throw new Error("Add API key first.");
    const res = await createVectorStore(name, settings);
    if (!res.ok) throw new Error(res.error);
    const next: Settings = { ...settings, vectorStoreId: res.data.id };
    setSettings(next);
    persistSettings(next);
    setToast(`Created vector store ${res.data.name ?? res.data.id}`);
    return res.data.id;
  };

  return (
    <div className="min-h-screen text-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <Header
          view={view}
          onChangeView={setView}
          onToggleChat={() => setChatOpen((v) => !v)}
          chatOpen={chatOpen}
          settingsReady={ready}
        />

        {toast && (
          <div className="mt-4 card text-sm text-ink-100/90 bg-ink-800/70 px-4 py-3 flex justify-between items-center">
            <span>{toast}</span>
            <button
              onClick={() => setToast(null)}
              className="text-ink-200 hover:text-white transition"
            >
              ×
            </button>
          </div>
        )}

        {view === "config" ? (
          <ConfigPanel
            settings={settings}
            onSave={handleSettingsSave}
            onBack={() => setView("kb")}
            onCreateVectorStore={handleCreateVectorStore}
          />
        ) : (
          <KnowledgeSpace
            ready={ready}
            files={files}
            filesLoading={filesLoading}
            uploading={uploading}
            error={error}
            onUpload={handleUpload}
            onRefresh={refreshFiles}
            onReplace={handleReplace}
            onDelete={handleDelete}
          />
        )}
      </div>

      <footer className="mt-6 mb-6 px-6">
        <div className="max-w-6xl mx-auto text-xs text-slate-100 flex items-center gap-3">
          <span className="h-px flex-1 bg-white/10" />
          <span className="px-4 py-2 rounded-xl bg-white/10 border border-white/15 shadow-soft text-white font-semibold">
            Supported by{" "}
            <a
              href="https://oappsnet.com"
              className="underline underline-offset-2 decoration-sand-400 hover:text-sand-200"
            >
              OAppsnet
            </a>
          </span>
          <span className="h-px flex-1 bg-white/10" />
        </div>
      </footer>

      <ChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onSend={handleAsk}
        messages={chatMessages}
        sending={chatSending}
        ready={ready}
      />
    </div>
  );
}

type HeaderProps = {
  view: "kb" | "config";
  onChangeView: (view: "kb" | "config") => void;
  onToggleChat: () => void;
  chatOpen: boolean;
  settingsReady: boolean;
};

const Header = ({
  view,
  onChangeView,
  onToggleChat,
  chatOpen,
  settingsReady
}: HeaderProps) => (
  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
    <div>
      <h1 className="text-3xl md:text-4xl font-semibold text-white mt-3">
        Vector Knowledge Base
      </h1>
      <p className="text-slate-300 mt-2 max-w-xl">
        Upload files, manage versions, and ask grounded questions through the OpenAI Vector Store.
      </p>
    </div>

    <div className="flex gap-3">
      <button
        onClick={() => onChangeView("kb")}
        className={`px-4 py-2 rounded-xl border border-white/10 ${
          view === "kb" ? "bg-white/15 text-white" : "text-slate-200 hover:bg-white/10"
        }`}
      >
        Workspace
      </button>
      <button
        onClick={() => onChangeView("config")}
        className={`px-4 py-2 rounded-xl border border-white/10 ${
          view === "config" ? "bg-white/15 text-white" : "text-slate-200 hover:bg-white/10"
        }`}
      >
        Configuration
      </button>
      <button
        onClick={onToggleChat}
        className="relative px-4 py-2 rounded-xl bg-sand-400 text-ink-900 font-semibold shadow-soft hover:-translate-y-0.5 transition"
      >
        {chatOpen ? "Close chat" : "Chat"}
        {!settingsReady && (
          <span className="absolute -right-2 -top-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
            !
          </span>
        )}
      </button>
    </div>
  </div>
);

type KnowledgeSpaceProps = {
  ready: boolean;
  files: KnowledgeFile[];
  filesLoading: boolean;
  uploading: boolean;
  error: string | null;
  onUpload: (file: File) => Promise<void>;
  onRefresh: () => void;
  onReplace: (fileId: string, file: File) => Promise<void>;
  onDelete: (fileId: string) => void;
};

const KnowledgeSpace = ({
  ready,
  files,
  filesLoading,
  uploading,
  error,
  onUpload,
  onRefresh,
  onReplace,
  onDelete
}: KnowledgeSpaceProps) => (
  <div className="mt-8 space-y-6">
    <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-6">
      <UploadCard ready={ready} uploading={uploading} onUpload={onUpload} />
      <DocumentationCard />
    </div>

    {error && (
      <div className="card px-5 py-3 text-sm text-red-200 bg-red-500/10 border border-red-500/20">
        {error}
      </div>
    )}

    <FileListCard
      ready={ready}
      files={files}
      filesLoading={filesLoading}
      onRefresh={onRefresh}
      onReplace={onReplace}
      onDelete={onDelete}
    />
  </div>
);

type UploadCardProps = {
  ready: boolean;
  uploading: boolean;
  onUpload: (file: File) => Promise<void>;
};

const UploadCard = ({ ready, uploading, onUpload }: UploadCardProps) => {
  const [file, setFile] = useState<File | null>(null);
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;
    await onUpload(file);
    setFile(null);
  };

  return (
    <div className="card p-6 lg:sticky lg:top-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="pill bg-ink-900 text-sand-100 border border-white/10 inline-flex mb-3">
            Upload
          </p>
          <h2 className="text-2xl font-semibold text-white">Add knowledge</h2>
          <p className="text-slate-300 mt-1 text-sm">Drop in PDFs, docs, or text files.</p>
        </div>
        <span className="shrink-0 h-11 w-11 rounded-2xl bg-sand-400 text-ink-900 grid place-items-center font-bold shadow-soft border border-white/20">
          ↑
        </span>
      </div>

      {!ready && (
        <div className="mt-4 text-sm text-red-100 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-lg">
          Add API key and vector store in Configuration first.
        </div>
      )}

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <div className="border border-dashed border-white/20 rounded-xl p-4 bg-white/5 hover:border-sand-400/60 transition cursor-pointer">
            <input
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-white font-medium">
              {file ? file.name : "Choose a file or drop it here"}
            </p>
            <p className="text-slate-400 text-xs mt-1">
              Supported: text, markdown, PDF, CSV, JSON and more.
            </p>
          </div>
        </label>

        <button
          type="submit"
          disabled={!file || uploading || !ready}
          className={`w-full py-3 rounded-xl font-semibold shadow-soft transition ${
            uploading
              ? "bg-sand-300 text-ink-900"
              : "bg-sand-400 text-ink-900 hover:-translate-y-0.5 hover:bg-sand-300"
          } disabled:opacity-60 disabled:hover:translate-y-0`}
        >
          {uploading ? "Uploading…" : file ? `Upload ${file.name}` : "Select a file"}
        </button>
      </form>
    </div>
  );
};

type ConfigPanelProps = {
  settings: Settings;
  onSave: (settings: Settings) => void;
  onBack: () => void;
  onCreateVectorStore: (name: string) => Promise<string>;
};

const ConfigPanel = ({ settings, onSave, onBack, onCreateVectorStore }: ConfigPanelProps) => {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model || "gpt-5-nano");
  const [vectorStoreId, setVectorStoreId] = useState(settings.vectorStoreId);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const next: Settings = {
      apiKey: apiKey.trim(),
      model: model.trim() || "gpt-5-nano",
      vectorStoreId: vectorStoreId.trim()
    };
    onSave(next);
  };

  const handleCreate = async () => {
    const name = prompt("Vector store name?");
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const id = await onCreateVectorStore(name);
      setVectorStoreId(id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="card p-8 mt-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="pill bg-sand-100 text-ink-800 inline-flex mb-2">Local settings</p>
          <h2 className="text-2xl font-semibold text-white">API + model</h2>
          <p className="text-slate-300 text-sm">
            Stored securely in your browser. Required for uploading files and running chat.
          </p>
        </div>
        <button
          onClick={onBack}
          className="text-slate-200 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg"
        >
          Back
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-100 bg-red-500/10 border border-red-500/30 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div>
          <label className="text-sm text-slate-200 block mb-2">OpenAI API key</label>
          <div className="flex items-center gap-2">
            <input
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full rounded-xl bg-ink-900/70 border border-white/10 px-4 py-3 text-white placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={() => setShowApiKey((prev) => !prev)}
              className="h-11 w-11 rounded-xl bg-white/10 text-white border border-white/15 hover:bg-white/15"
              title={showApiKey ? "Hide API key" : "Show API key"}
              aria-label={showApiKey ? "Hide API key" : "Show API key"}
            >
              {showApiKey ? "🙈" : "👁"}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Only stored in localStorage. Needed for file uploads and chat completions.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-slate-200 block mb-2">Default model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-xl bg-ink-900/70 border border-white/10 px-4 py-3 text-white"
            >
              <option value="gpt-5-nano">gpt-5-nano (default)</option>
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="gpt-4o">gpt-4o</option>
              <option value="gpt-4.1">gpt-4.1</option>
              <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-200 block mb-2">Vector store ID</label>
            <div className="flex gap-3">
              <input
                value={vectorStoreId}
                onChange={(e) => setVectorStoreId(e.target.value)}
                className="flex-1 rounded-xl bg-ink-900/70 border border-white/10 px-4 py-3 text-white"
                placeholder="vs_..."
              />
              <button
                type="button"
                onClick={handleCreate}
                className="px-4 py-2 rounded-xl bg-sand-400 text-ink-900 font-semibold shadow-soft hover:bg-sand-300"
              >
                {creating ? "Creating..." : "New"}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              You can paste an existing vector store id or create a new one.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Settings are saved locally. Clear them anytime by emptying the fields.
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-sand-400 text-ink-900 font-semibold shadow-soft hover:bg-sand-300"
          >
            Save settings
          </button>
        </div>
      </form>
    </div>
  );
};

type ChatDrawerProps = {
  open: boolean;
  onClose: () => void;
  onSend: (question: string) => void;
  messages: ChatMessage[];
  sending: boolean;
  ready: boolean;
};

const ChatDrawer = ({ open, onClose, onSend, messages, sending, ready }: ChatDrawerProps) => {
  const [input, setInput] = useState("");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div
      className={`fixed inset-y-0 right-0 w-full sm:w-[420px] transition-transform duration-300 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="h-full glass backdrop-blur-lg border-l border-white/10 shadow-2xl bg-ink-900/80 flex flex-col">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase text-sand-200 tracking-wide">Ask the KB</p>
            <p className="text-lg font-semibold text-white">Contextual chat</p>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            ×
          </button>
        </div>

        {!ready && (
          <div className="p-5 text-sm text-red-100 bg-red-500/10 border-b border-red-500/20">
            Add API key and vector store in Configuration to enable chat.
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-slate-300 text-sm">
              Ask something like &ldquo;What summaries do we have about onboarding?&rdquo;
            </div>
          )}
          {messages.map((message) => (
            <div key={message.id} className="space-y-1">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                {message.role}
              </div>
              <div
                className={`p-3 rounded-xl border border-white/10 text-sm leading-relaxed ${
                  message.role === "assistant"
                  ? "bg-white/5 text-white"
                  : "bg-sand-100 text-ink-900"
                }`}
              >
                {typeof message.content === "string"
                  ? message.content
                  : JSON.stringify(message.content)}
              </div>
            </div>
          ))}
          {sending && <div className="text-slate-300 text-sm">Thinking…</div>}
        </div>

        <form onSubmit={handleSubmit} className="p-4 border-t border-white/5 space-y-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your knowledge base..."
            rows={3}
            className="w-full rounded-xl bg-ink-900/70 border border-white/10 px-3 py-2 text-white placeholder:text-slate-500"
            disabled={!ready}
          />
          <button
            type="submit"
            disabled={!ready || sending || !input.trim()}
            className="w-full py-2.5 rounded-xl bg-sand-400 text-ink-900 font-semibold shadow-soft hover:bg-sand-300 disabled:opacity-60"
          >
            {sending ? "Generating..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default App;

const DocumentationCard = () => (
  <div className="card p-6 space-y-4">
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-2">
        <p className="pill bg-white/10 text-sand-100 border border-white/10 inline-flex">
          Help
        </p>
        <h3 className="text-xl font-semibold text-white">Working with your KB</h3>
        <p className="text-slate-300 text-sm">
          1) Add your API key + vector store in Configuration. 2) Upload files above. 3) Open
          Chat to ask questions grounded in your files. Settings stay in your browser.
        </p>
      </div>
      <div className="shrink-0 h-11 w-11 rounded-2xl bg-sand-400 text-ink-900 grid place-items-center font-bold shadow-soft border border-white/20">
        ?
      </div>
    </div>
    <div className="grid gap-3 md:grid-cols-3 text-sm text-slate-200">
      <div className="p-3 rounded-xl bg-white/5 border border-white/10">
        <div className="font-semibold text-white mb-1">Uploads</div>
        <p className="text-slate-300">
          Use the upload card to send PDFs, docs, or text files to your vector store.
        </p>
      </div>
      <div className="p-3 rounded-xl bg-white/5 border border-white/10">
        <div className="font-semibold text-white mb-1">Chat</div>
        <p className="text-slate-300">
          Click Chat, ask a question, and the response will search your store for context.
        </p>
      </div>
      <div className="p-3 rounded-xl bg-white/5 border border-white/10">
        <div className="font-semibold text-white mb-1">Settings</div>
        <p className="text-slate-300">
          Keys and model stay local; clear them anytime by saving empty values.
        </p>
      </div>
    </div>
  </div>
);

type FileListProps = {
  ready: boolean;
  files: KnowledgeFile[];
  filesLoading: boolean;
  onRefresh: () => void;
  onReplace: (id: string, file: File) => Promise<void>;
  onDelete: (id: string) => void;
};

const FileListCard = ({
  ready,
  files,
  filesLoading,
  onRefresh,
  onReplace,
  onDelete
}: FileListProps) => (
  <div className="card">
    <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
      <div>
        <p className="text-slate-300 text-sm">Stored documents</p>
        <p className="text-xl font-semibold text-white">{files.length} files</p>
      </div>
      <button
        onClick={onRefresh}
        className="text-sand-100 bg-sand-500/20 hover:bg-sand-500/30 px-3 py-1.5 rounded-lg border border-sand-400/30"
      >
        Refresh
      </button>
    </div>

    {!ready && (
      <div className="p-6 text-slate-300 text-sm">
        Add your API key and vector store id in the configuration panel to start.
      </div>
    )}

    {ready && (
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-300 tracking-wide">
              <th className="px-5 py-3">File</th>
              <th className="px-5 py-3">Size</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Created</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filesLoading && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {!filesLoading && files.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-slate-400">
                  No files yet. Upload your first document.
                </td>
              </tr>
            )}
            {!filesLoading &&
              files.map((file) => (
                <FileRow
                  key={file.id}
                  file={file}
                  onDelete={onDelete}
                  onReplace={onReplace}
                />
              ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

type FileRowProps = {
  file: KnowledgeFile;
  onReplace: (id: string, file: File) => Promise<void>;
  onDelete: (id: string) => void;
};

const FileRow = ({ file, onReplace, onDelete }: FileRowProps) => {
  const [replacing, setReplacing] = useState(false);

  return (
    <tr className="text-sm text-slate-100">
      <td className="px-5 py-4">
        <div className="font-semibold">{file.filename}</div>
      </td>
      <td className="px-5 py-4 text-slate-300">{formatBytes(file.bytes)}</td>
      <td className="px-5 py-4">
        <span
          className={`pill ${
            file.status === "completed"
              ? "bg-green-500/20 text-green-100"
              : file.status === "in_progress"
                ? "bg-yellow-500/10 text-yellow-200"
                : "bg-white/10 text-slate-100"
          }`}
        >
          {file.status}
        </span>
      </td>
      <td className="px-5 py-4 text-slate-400">{formatDate(file.created_at)}</td>
      <td className="px-5 py-4 text-right">
        <div className="flex justify-end gap-2">
          <label className="relative">
            <input
              type="file"
              className="hidden"
              onChange={async (e) => {
                const next = e.target.files?.[0];
                if (!next) return;
                setReplacing(true);
                await onReplace(file.id, next);
                setReplacing(false);
              }}
            />
            <span
              className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-white/10 text-slate-100 hover:bg-white/10 cursor-pointer"
              title="Upload new version"
              aria-label="Upload new version"
            >
              ⤴
            </span>
          </label>
          <button
            onClick={() => onDelete(file.id)}
            className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-red-500/40 text-red-100 hover:bg-red-500/10"
            title="Delete file"
            aria-label="Delete file"
          >
            🗑
          </button>
        </div>
        {replacing && (
          <div className="text-xs text-slate-400 mt-2">Uploading replacement…</div>
        )}
      </td>
    </tr>
  );
};
