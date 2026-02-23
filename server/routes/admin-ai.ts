import { Router } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole, requirePermission, logAudit } from "./shared";
import { createAiClient, clearAdapterCache } from "../ai-client";
import { clearAiConfigCache } from "../ai-cache";
import { AI_TASK_KEYS, AI_TASK_LABELS, AI_TASK_DEFAULT_TIER, AI_TASK_DEFAULTS, AI_PROVIDER_TYPES } from "@shared/schema";
import type { AiTaskKey } from "@shared/schema";
import type { AiProvider } from "@shared/schema";

const router = Router();

router.get("/api/admin/ai/providers", requireAuth, requirePermission("ai_config"), async (_req, res) => {
  try {
    const providers = await storage.getAiProviders();
    const safe = providers.map(p => ({
      ...p,
      apiKeyEnvVar: p.apiKeyEnvVar || null,
      hasApiKey: p.apiKeyEnvVar ? !!process.env[p.apiKeyEnvVar] : false,
    }));
    res.json(safe);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/api/admin/ai/providers/:id", requireAuth, requirePermission("ai_config"), async (req, res) => {
  try {
    const provider = await storage.getAiProvider(parseInt(req.params.id));
    if (!provider) return res.status(404).json({ error: "Provedor não encontrado" });
    res.json({
      ...provider,
      hasApiKey: provider.apiKeyEnvVar ? !!process.env[provider.apiKeyEnvVar] : false,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/api/admin/ai/providers", requireAuth, requirePermission("ai_config"), async (req, res) => {
  try {
    const { name, providerType, apiKeyEnvVar, baseUrl, enabled, isDefault, capabilities } = req.body;
    if (!name || !providerType) {
      return res.status(400).json({ error: "Nome e tipo são obrigatórios" });
    }
    if (!AI_PROVIDER_TYPES.includes(providerType)) {
      return res.status(400).json({ error: `Tipo inválido. Valores aceitos: ${AI_PROVIDER_TYPES.join(", ")}` });
    }

    const provider = await storage.createAiProvider({
      name,
      providerType,
      apiKeyEnvVar: apiKeyEnvVar || null,
      baseUrl: baseUrl || null,
      enabled: enabled !== false,
      isDefault: isDefault || false,
      capabilities: capabilities || ["chat"],
    });

    await logAudit(req, "create", "ai_provider", String(provider.id), { name, providerType });
    clearAdapterCache();
    clearAiConfigCache();
    res.status(201).json(provider);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/api/admin/ai/providers/:id", requireAuth, requirePermission("ai_config"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, providerType, apiKeyEnvVar, baseUrl, enabled, isDefault, capabilities } = req.body;

    if (providerType !== undefined && !AI_PROVIDER_TYPES.includes(providerType)) {
      return res.status(400).json({ error: `Tipo inválido. Valores aceitos: ${AI_PROVIDER_TYPES.join(", ")}` });
    }

    const provider = await storage.updateAiProvider(id, {
      ...(name !== undefined ? { name } : {}),
      ...(providerType !== undefined ? { providerType } : {}),
      ...(apiKeyEnvVar !== undefined ? { apiKeyEnvVar } : {}),
      ...(baseUrl !== undefined ? { baseUrl } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(isDefault !== undefined ? { isDefault } : {}),
      ...(capabilities !== undefined ? { capabilities } : {}),
    });

    if (!provider) return res.status(404).json({ error: "Provedor não encontrado" });

    await logAudit(req, "update", "ai_provider", String(id), { name: provider.name });
    clearAdapterCache(id);
    clearAiConfigCache();
    res.json(provider);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/api/admin/ai/providers/:id", requireAuth, requirePermission("ai_config"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await storage.deleteAiProvider(id);
    if (!deleted) return res.status(404).json({ error: "Provedor não encontrado" });

    await logAudit(req, "delete", "ai_provider", String(id));
    clearAdapterCache(id);
    clearAiConfigCache();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/api/admin/ai/providers/:id/models", requireAuth, requirePermission("ai_config"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const provider = await storage.getAiProvider(id);
    if (!provider) return res.status(404).json({ error: "Provedor não encontrado" });

    const client = createAiClient(provider);
    const models = await client.listModels();
    res.json(models);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/api/admin/ai/tasks", requireAuth, requirePermission("ai_config"), async (_req, res) => {
  try {
    const configs = await storage.getAiTaskConfigs();
    const providers = await storage.getAiProviders();
    const providerMap = new Map(providers.map(p => [p.id, p]));

    const tasks = AI_TASK_KEYS.map(key => {
      const config = configs.find(c => c.taskKey === key);
      const provider = config?.providerId ? providerMap.get(config.providerId) : null;
      const fallbackProvider = config?.fallbackProviderId ? providerMap.get(config.fallbackProviderId) : null;

      const defaults = AI_TASK_DEFAULTS[key];
      return {
        taskKey: key,
        label: AI_TASK_LABELS[key],
        defaultTier: AI_TASK_DEFAULT_TIER[key],
        defaults,
        configured: !!config,
        config: config ? {
          id: config.id,
          providerId: config.providerId,
          providerName: provider?.name || null,
          providerType: provider?.providerType || null,
          modelId: config.modelId,
          fallbackProviderId: config.fallbackProviderId,
          fallbackProviderName: fallbackProvider?.name || null,
          fallbackModelId: config.fallbackModelId,
          maxTokens: config.maxTokens,
          temperature: config.temperature,
          enabled: config.enabled,
        } : null,
      };
    });

    res.json(tasks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/api/admin/ai/tasks/:taskKey", requireAuth, requirePermission("ai_config"), async (req, res) => {
  try {
    const { taskKey } = req.params;
    if (!AI_TASK_KEYS.includes(taskKey as any)) {
      return res.status(400).json({ error: `Tarefa inválida: ${taskKey}` });
    }

    const { providerId, modelId, fallbackProviderId, fallbackModelId, maxTokens, temperature, enabled } = req.body;

    const defaults = AI_TASK_DEFAULTS[taskKey as AiTaskKey];
    const parsedMaxTokens = maxTokens != null && maxTokens !== "" && maxTokens !== "null" ? parseInt(String(maxTokens), 10) : defaults.maxTokens;
    const parsedTemperature = temperature != null && temperature !== "" && temperature !== "null" ? String(temperature) : String(defaults.temperature);
    const parsedProviderId = providerId != null && providerId !== "" && providerId !== "null" ? parseInt(String(providerId), 10) : null;
    const parsedFallbackProviderId = fallbackProviderId != null && fallbackProviderId !== "" && fallbackProviderId !== "null" ? parseInt(String(fallbackProviderId), 10) : null;

    const config = await storage.upsertAiTaskConfig({
      taskKey,
      providerId: parsedProviderId,
      modelId: modelId || null,
      fallbackProviderId: parsedFallbackProviderId,
      fallbackModelId: fallbackModelId || null,
      maxTokens: isNaN(parsedMaxTokens as number) ? null : parsedMaxTokens,
      temperature: parsedTemperature,
      enabled: enabled !== false,
    });

    await logAudit(req, "update", "ai_task_config", taskKey, { providerId, modelId });
    clearAiConfigCache();
    res.json(config);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/api/admin/ai/tasks/:taskKey/apply-to-all", requireAuth, requirePermission("ai_config"), async (req, res) => {
  try {
    const { taskKey } = req.params;
    const sourceConfig = await storage.getAiTaskConfig(taskKey);
    if (!sourceConfig) {
      return res.status(404).json({ error: "Configuração de origem não encontrada" });
    }

    let count = 0;
    for (const key of AI_TASK_KEYS) {
      if (key === taskKey) continue;
      const defaults = AI_TASK_DEFAULTS[key as AiTaskKey];
      await storage.upsertAiTaskConfig({
        taskKey: key,
        providerId: sourceConfig.providerId,
        modelId: sourceConfig.modelId,
        fallbackProviderId: sourceConfig.fallbackProviderId,
        fallbackModelId: sourceConfig.fallbackModelId,
        maxTokens: defaults.maxTokens,
        temperature: String(defaults.temperature),
        enabled: true,
      });
      count++;
    }

    await logAudit(req, "apply_to_all", "ai_task_config", taskKey, { tasksUpdated: count });
    clearAiConfigCache();
    res.json({ success: true, tasksUpdated: count });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/api/admin/ai/tasks/:taskKey", requireAuth, requirePermission("ai_config"), async (req, res) => {
  try {
    const { taskKey } = req.params;
    const deleted = await storage.deleteAiTaskConfig(taskKey);
    if (!deleted) return res.status(404).json({ error: "Configuração não encontrada" });

    await logAudit(req, "delete", "ai_task_config", taskKey);
    clearAiConfigCache();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/api/admin/ai/provider-types", requireAuth, requirePermission("ai_config"), async (_req, res) => {
  res.json(AI_PROVIDER_TYPES.map(t => ({
    value: t,
    label: {
      openai: "OpenAI",
      anthropic: "Anthropic (Claude)",
      gemini: "Google Gemini",
      openai_compatible: "OpenAI Compatível (Local/Custom)",
    }[t],
  })));
});

router.post("/api/admin/ai/test-provider/:id", requireAuth, requirePermission("ai_config"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const provider = await storage.getAiProvider(id);
    if (!provider) return res.status(404).json({ error: "Provedor não encontrado" });

    const client = createAiClient(provider);
    const startTime = Date.now();
    const result = await client.chatCompletion({
      model: req.body.model || "gpt-4o-mini",
      messages: [
        { role: "system", content: "Responda em português brasileiro." },
        { role: "user", content: "Diga 'Conexão OK' e informe qual modelo você é." },
      ],
      maxTokens: 50,
    });
    const elapsed = Date.now() - startTime;

    res.json({
      success: true,
      response: result.content,
      model: result.model,
      provider: result.provider,
      latencyMs: elapsed,
      usage: result.usage,
    });
  } catch (error: any) {
    res.json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
