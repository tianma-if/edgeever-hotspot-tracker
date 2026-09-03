import type { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv, Bindings } from './api-context';
import { requireUser, getWorkspaceId } from './request-auth';
import { apiError } from './http-errors';
import { AppError } from './app-error';
import { getAiSettings, loadDefaultAiModel, resolvePrimaryAiCredentialEncryptionKey } from './ai-service';
import { generateAiText } from './ai-runtime';
import { searchPublicSources } from './plugin-research-sources';

const SearchSchema = z.object({ query: z.string().trim().min(1).max(240), source: z.enum(['news', 'hackernews', 'github', 'reddit']), days: z.number().int().min(1).max(90), limit: z.number().int().min(1).max(15).optional() }).strict();
const GenerateSchema = z.object({ system: z.string().max(8000), prompt: z.string().min(1).max(90000), maxOutputTokens: z.number().int().min(100).max(5000).optional() }).strict();
// A bounded per-isolate safeguard, not a distributed billing or quota system.
const active = new Map<string, number>();
export const registerPluginResearchRoutes = (app: Hono<AppEnv>, dependencies: {
  isDemoMode: (env: Bindings) => boolean;
  search?: typeof searchPublicSources;
  generate?: (input: z.infer<typeof GenerateSchema>, signal: AbortSignal) => Promise<{ text: string }>;
}) => {
  app.use('/api/v1/plugins/research/*', async (context, next) => {
    const denied = requireUser(context); if (denied) return denied;
    const key = `${getWorkspaceId(context)}:${context.req.path.endsWith('/generate') ? 'ai' : 'read'}`;
    const count = active.get(key) ?? 0;
    if (count >= 4) return apiError(context, 'research_busy', 'Too many research requests. Try again shortly.', 429);
    active.set(key, count + 1);
    try { await next(); } finally { const remaining = (active.get(key) ?? 1) - 1; if (remaining) active.set(key, remaining); else active.delete(key); }
  });
  app.get('/api/v1/plugins/research/status', async (context) => {
    const settings = await getAiSettings(context.env.storage.db, getWorkspaceId(context), Boolean(resolvePrimaryAiCredentialEncryptionKey(context.env)), dependencies.isDemoMode(context.env));
    const provider = settings.providers.find((provider) => provider.isEnabled && provider.models.some((model) => model.id === settings.defaultModelId));
    const model = provider?.models.find((model) => model.id === settings.defaultModelId);
    return context.json({ configured: Boolean(model && !dependencies.isDemoMode(context.env)), ...(model ? { modelName: model.displayName } : {}) });
  });
  app.post('/api/v1/plugins/research/search', zValidator('json', SearchSchema), async (context) => {
    const result = await (dependencies.search ?? searchPublicSources)(context.req.valid('json'), { signal: context.req.raw.signal });
    return context.json(result);
  });
  app.post('/api/v1/plugins/research/generate', zValidator('json', GenerateSchema), async (context) => {
    if (dependencies.isDemoMode(context.env)) return apiError(context, 'ai_demo_disabled', 'Configure AI in your own EdgeEver instance to generate reports.', 403);
    try {
      const input = context.req.valid('json');
      const signal = AbortSignal.any([context.req.raw.signal, AbortSignal.timeout(120000)]);
      if (dependencies.generate) return context.json(await dependencies.generate(input, signal));
      const model = await loadDefaultAiModel(context.env.storage.db, getWorkspaceId(context), context.env);
      const result = await generateAiText({ model, system: input.system, prompt: input.prompt, maxOutputTokens: input.maxOutputTokens ?? 3000, abortSignal: signal });
      return context.json({ text: result.text });
    } catch (error) {
      if (error instanceof AppError) return apiError(context, error.code, error.message, error.status);
      // Provider errors may contain credentials or request bodies. Do not relay them.
      return apiError(context, 'research_generation_failed', 'AI generation failed or timed out. Check the default AI model in EdgeEver settings.', 502);
    }
  });
};
