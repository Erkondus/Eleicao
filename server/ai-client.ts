import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AiProviderType, AiProvider } from "@shared/schema";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  model: string;
  messages: ChatMessage[];
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatCompletionResult {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

export interface AiClientAdapter {
  chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult>;
  listModels(): Promise<ModelInfo[]>;
  createEmbedding?(input: string, model?: string): Promise<number[]>;
}

function getApiKey(provider: AiProvider): string | undefined {
  if (provider.apiKeyEnvVar) {
    return process.env[provider.apiKeyEnvVar];
  }
  return undefined;
}

class OpenAIAdapter implements AiClientAdapter {
  private client: OpenAI;
  private providerName: string;

  constructor(provider: AiProvider) {
    this.providerName = provider.name;
    const apiKey = getApiKey(provider);
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
      ...(provider.baseUrl ? { baseURL: provider.baseUrl } : {}),
    });
  }

  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const messages: OpenAI.ChatCompletionMessageParam[] = options.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const completion = await this.client.chat.completions.create({
      model: options.model,
      messages,
      ...(options.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      ...(options.maxTokens ? { max_completion_tokens: options.maxTokens } : {}),
      ...(options.temperature !== undefined ? { temperature: parseFloat(String(options.temperature)) } : {}),
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Sem resposta da IA (OpenAI)");

    return {
      content,
      usage: completion.usage ? {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
      } : undefined,
      model: options.model,
      provider: this.providerName,
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const models = await this.client.models.list();
      const chatModels = [];
      for await (const model of models) {
        if (model.id.includes("gpt") || model.id.includes("o1") || model.id.includes("o3") || model.id.includes("o4")) {
          chatModels.push({
            id: model.id,
            name: model.id,
            provider: this.providerName,
          });
        }
      }
      return chatModels.sort((a, b) => a.id.localeCompare(b.id));
    } catch (e: any) {
      console.warn(`[AI Client] Failed to list OpenAI models:`, e.message);
      return [
        { id: "gpt-4o", name: "GPT-4o", provider: this.providerName },
        { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: this.providerName },
        { id: "gpt-4.1", name: "GPT-4.1", provider: this.providerName },
        { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", provider: this.providerName },
        { id: "gpt-4.1-nano", name: "GPT-4.1 Nano", provider: this.providerName },
        { id: "o3-mini", name: "o3-mini", provider: this.providerName },
      ];
    }
  }

  async createEmbedding(input: string, model: string = "text-embedding-3-small"): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model,
      input,
    });
    return response.data[0].embedding;
  }
}

class AnthropicAdapter implements AiClientAdapter {
  private client: Anthropic;
  private providerName: string;

  constructor(provider: AiProvider) {
    this.providerName = provider.name;
    const apiKey = getApiKey(provider);
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
      ...(provider.baseUrl ? { baseURL: provider.baseUrl } : {}),
    });
  }

  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const systemMsg = options.messages.find(m => m.role === "system");
    const userMessages = options.messages.filter(m => m.role !== "system");

    let systemPrompt = systemMsg?.content || "";
    if (options.jsonMode) {
      systemPrompt += "\n\nIMPORTANTE: Responda APENAS com JSON válido. Não inclua texto antes ou depois do JSON.";
    }

    const messages: Anthropic.MessageParam[] = userMessages.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const response = await this.client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens || 4096,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages,
      ...(options.temperature !== undefined ? { temperature: parseFloat(String(options.temperature)) } : {}),
    });

    const textBlock = response.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("Sem resposta da IA (Anthropic)");

    return {
      content: textBlock.text,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      model: options.model,
      provider: this.providerName,
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: this.providerName },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", provider: this.providerName },
      { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", provider: this.providerName },
      { id: "claude-3-opus-20240229", name: "Claude 3 Opus", provider: this.providerName },
      { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku", provider: this.providerName },
    ];
  }
}

class GeminiAdapter implements AiClientAdapter {
  private client: GoogleGenerativeAI;
  private providerName: string;

  constructor(provider: AiProvider) {
    this.providerName = provider.name;
    const apiKey = getApiKey(provider) || process.env.GEMINI_API_KEY || "";
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const systemMsg = options.messages.find(m => m.role === "system");
    const userMessages = options.messages.filter(m => m.role !== "system");

    let systemInstruction = systemMsg?.content || "";
    if (options.jsonMode) {
      systemInstruction += "\n\nIMPORTANTE: Responda APENAS com JSON válido. Não inclua texto antes ou depois do JSON.";
    }

    const model = this.client.getGenerativeModel({
      model: options.model,
      ...(systemInstruction ? { systemInstruction } : {}),
      generationConfig: {
        ...(options.maxTokens ? { maxOutputTokens: options.maxTokens } : {}),
        ...(options.temperature !== undefined ? { temperature: parseFloat(String(options.temperature)) } : {}),
        ...(options.jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    });

    const prompt = userMessages.map(m => m.content).join("\n\n");
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    if (!text) throw new Error("Sem resposta da IA (Gemini)");

    const usage = result.response.usageMetadata;
    return {
      content: text,
      usage: usage ? {
        promptTokens: usage.promptTokenCount || 0,
        completionTokens: usage.candidatesTokenCount || 0,
        totalTokens: usage.totalTokenCount || 0,
      } : undefined,
      model: options.model,
      provider: this.providerName,
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: this.providerName },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: this.providerName },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: this.providerName },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: this.providerName },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", provider: this.providerName },
    ];
  }

  async createEmbedding(input: string, model: string = "text-embedding-004"): Promise<number[]> {
    const embModel = this.client.getGenerativeModel({ model });
    const result = await embModel.embedContent(input);
    return result.embedding.values;
  }
}

class OpenAICompatibleAdapter extends OpenAIAdapter {
  private compatProviderName: string;

  constructor(provider: AiProvider) {
    super(provider);
    this.compatProviderName = provider.name;
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      return await super.listModels();
    } catch (e: any) {
      console.warn(`[AI Client] Could not list models for ${this.compatProviderName}:`, e.message);
      return [];
    }
  }
}

const adapterCache = new Map<number, { adapter: AiClientAdapter; updatedAt: string }>();

export function createAiClient(provider: AiProvider): AiClientAdapter {
  const cached = adapterCache.get(provider.id);
  const updatedStr = provider.updatedAt?.toString() || "";
  if (cached && cached.updatedAt === updatedStr) {
    return cached.adapter;
  }

  let adapter: AiClientAdapter;
  switch (provider.providerType as AiProviderType) {
    case "openai":
      adapter = new OpenAIAdapter(provider);
      break;
    case "anthropic":
      adapter = new AnthropicAdapter(provider);
      break;
    case "gemini":
      adapter = new GeminiAdapter(provider);
      break;
    case "openai_compatible":
      adapter = new OpenAICompatibleAdapter(provider);
      break;
    default:
      adapter = new OpenAIAdapter(provider);
  }

  adapterCache.set(provider.id, { adapter, updatedAt: updatedStr });
  return adapter;
}

export function clearAdapterCache(providerId?: number) {
  if (providerId) {
    adapterCache.delete(providerId);
  } else {
    adapterCache.clear();
  }
}
