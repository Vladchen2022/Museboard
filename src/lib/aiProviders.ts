import type { AiProvider, AiSettings } from "../types";

export interface AiProviderOption {
  id: AiProvider;
  label: string;
  endpoint: string;
  model: string;
  requiresApiKey: boolean;
  supportsApiKey: boolean;
  protocol: "openaiCompatible" | "ollama";
}

export const AI_PROVIDER_OPTIONS: AiProviderOption[] = [
  {
    id: "lmStudio",
    label: "LM Studio",
    endpoint: "http://localhost:1234/v1",
    model: "",
    requiresApiKey: false,
    supportsApiKey: false,
    protocol: "openaiCompatible",
  },
  {
    id: "openai",
    label: "OpenAI API",
    endpoint: "https://api.openai.com/v1",
    model: "",
    requiresApiKey: true,
    supportsApiKey: true,
    protocol: "openaiCompatible",
  },
  {
    id: "deepseek",
    label: "DeepSeek API",
    endpoint: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    requiresApiKey: true,
    supportsApiKey: true,
    protocol: "openaiCompatible",
  },
  {
    id: "ollama",
    label: "Ollama",
    endpoint: "http://localhost:11434",
    model: "",
    requiresApiKey: false,
    supportsApiKey: false,
    protocol: "ollama",
  },
  {
    id: "customOpenAi",
    label: "OpenAI-compatible",
    endpoint: "",
    model: "",
    requiresApiKey: false,
    supportsApiKey: true,
    protocol: "openaiCompatible",
  },
];

export const defaultAiSettings: AiSettings = {
  provider: "lmStudio",
  endpoint: "http://localhost:1234/v1",
  apiKey: "",
  model: "",
  temperature: 0.7,
};

export function getAiProviderOption(provider: AiProvider): AiProviderOption {
  return AI_PROVIDER_OPTIONS.find((option) => option.id === provider) ?? AI_PROVIDER_OPTIONS[0];
}

export function normalizeAiSettings(settings: Partial<AiSettings> | undefined): AiSettings {
  const provider =
    settings?.provider && AI_PROVIDER_OPTIONS.some((option) => option.id === settings.provider)
      ? settings.provider
      : defaultAiSettings.provider;
  const preset = getAiProviderOption(provider);

  return {
    provider,
    endpoint: settings?.endpoint ?? preset.endpoint,
    apiKey: settings?.apiKey || "",
    model: settings?.model ?? preset.model,
    temperature:
      typeof settings?.temperature === "number" ? settings.temperature : defaultAiSettings.temperature,
  };
}
