import { Settings } from "@/types";

const STORAGE_KEY = "kb-settings";

const defaultSettings: Settings = {
  apiKey: "",
  model: "gpt-5-nano",
  vectorStoreId: ""
};

export function loadSettings(): Settings {
  if (typeof window === "undefined") return defaultSettings;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultSettings;

  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      apiKey: parsed.apiKey ?? "",
      model: parsed.model ?? defaultSettings.model,
      vectorStoreId: parsed.vectorStoreId ?? ""
    };
  } catch {
    return defaultSettings;
  }
}

export function persistSettings(settings: Settings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
