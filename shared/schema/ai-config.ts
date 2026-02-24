import { sql, relations } from "drizzle-orm";
import { pgTable, text, integer, serial, timestamp, decimal, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const aiProviders = pgTable("ai_providers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  providerType: text("provider_type").notNull(),
  apiKeyEnvVar: text("api_key_env_var"),
  baseUrl: text("base_url"),
  enabled: boolean("enabled").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  capabilities: jsonb("capabilities").default(["chat"]),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const insertAiProviderSchema = createInsertSchema(aiProviders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAiProvider = z.infer<typeof insertAiProviderSchema>;
export type AiProvider = typeof aiProviders.$inferSelect;

export const aiTaskConfigs = pgTable("ai_task_configs", {
  id: serial("id").primaryKey(),
  taskKey: text("task_key").notNull().unique(),
  providerId: integer("provider_id").references(() => aiProviders.id, { onDelete: "set null" }),
  modelId: text("model_id"),
  fallbackProviderId: integer("fallback_provider_id").references(() => aiProviders.id, { onDelete: "set null" }),
  fallbackModelId: text("fallback_model_id"),
  maxTokens: integer("max_tokens"),
  temperature: decimal("temperature"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const insertAiTaskConfigSchema = createInsertSchema(aiTaskConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAiTaskConfig = z.infer<typeof insertAiTaskConfigSchema>;
export type AiTaskConfig = typeof aiTaskConfigs.$inferSelect;

export const aiTaskConfigsRelations = relations(aiTaskConfigs, ({ one }) => ({
  provider: one(aiProviders, { fields: [aiTaskConfigs.providerId], references: [aiProviders.id] }),
  fallbackProvider: one(aiProviders, { fields: [aiTaskConfigs.fallbackProviderId], references: [aiProviders.id] }),
}));
