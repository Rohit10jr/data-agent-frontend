# nao Frontend → Django Backend — Migration Checklist

Every tRPC call the frontend makes (126 total), grouped by namespace, with a **recommended** Keep / Drop judgement and a suggested Django endpoint for the ones kept.

Recommendations assume a **minimal SQL agent** deployment:
- Single-tenant (one org, one project).
- No Slack / Teams / Telegram / WhatsApp integrations.
- No GitHub OAuth, no MCP servers, no sharing between users.
- No spend budgets, no admin-wide log/usage dashboards.
- Django handles auth (session cookie or JWT).
- Agent answers SQL questions; memory + stories are optional.

Flip entries to ❌ if you want to drop something I recommended keeping (or vice versa). Columns:

- **Rec.** — ✅ keep / ❌ drop / ⚠️ optional (your call)
- **Django endpoint** — suggested REST path for kept items (DRF style)
- **Status** — ⬜ not started / 🟡 in progress / ✅ done

---

## Legend — procedure type symbols

- `Q` — Query (reads)
- `M` — Mutation (writes)
- Arrow columns: `🔒` = requires auth, `👑` = admin-only

---

## 1. Authentication & Identity (non-tRPC + tRPC)

### 1a. REST endpoints (Better Auth passthrough)

| Frontend call | Type | Purpose | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `POST /api/auth/sign-up/email` | REST | Email + password sign-up | ✅ | `POST /api/auth/register/` | ⬜ |
| `POST /api/auth/sign-in/email` | REST | Email + password login | ✅ | `POST /api/auth/login/` | ⬜ |
| `POST /api/auth/sign-out` | REST | Logout | ✅ | `POST /api/auth/logout/` | ⬜ |
| `GET /api/auth/get-session` | REST | Current user + session | ✅ | `GET /api/auth/me/` | ⬜ |
| `POST /api/auth/forget-password` | REST | Request password reset | ⚠️ | `POST /api/auth/forgot-password/` | ⬜ |
| `POST /api/auth/reset-password` | REST | Complete password reset | ⚠️ | `POST /api/auth/reset-password/` | ⬜ |
| OAuth flows (Google/GitHub) | REST | SSO | ⚠️ | Django social-auth | ⬜ |

### 1b. Account

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `account.modifyPassword` | M | 🔒 | ⚠️ | `POST /api/auth/change-password/` | ⬜ |
| `account.resetPassword` | M | 👑 | ❌ *(admin-reset-other — skip for single-tenant)* | — | — |

### 1c. User

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `user.countAll` | Q | — | ⚠️ *(used by first-run setup screen — keep if you want that UX)* | `GET /api/users/count/` | ⬜ |
| `user.getMemorySettings` | Q | 🔒 | ✅ | `GET /api/users/me/memory-settings/` | ⬜ |
| `user.getMemories` | Q | 🔒 | ✅ | `GET /api/users/me/memories/` | ⬜ |
| `user.modify` | M | 🔒 | ❌ *(multi-member admin feature)* | — | — |
| `user.addUserToProject` | M | 👑 | ❌ | — | — |

### 1d. Auth config (login-page visibility flags)

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `authConfig.google.*` (`isSetup`, `getSettings`, `updateSettings`) | Q/M | mixed | ❌ *(stub to return `false` or drop the Google button entirely)* | — | — |
| `authConfig.github.*` | Q | — | ❌ | — | — |
| `authConfig.smtp.*` | Q | — | ❌ *(or stub as `true`/`false` based on whether you configured SMTP)* | — | — |

### 1e. API keys

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `apiKey.create` | M | 👑 | ❌ *(nao used these for /api/deploy — you don't have that)* | — | — |
| `apiKey.list` | Q | 👑 | ❌ | — | — |
| `apiKey.revoke` | M | 👑 | ❌ | — | — |

### 1f. Organization

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `organization.get` | Q | 🔒 | ❌ *(single-tenant)* | — | — |
| `organization.getProjects` | Q | 🔒 | ❌ | — | — |
| `organization.getMembers` | Q | 🔒 | ❌ | — | — |
| `organization.addMember` | M | 👑 | ❌ | — | — |
| `organization.modifyMember` | M | 👑 | ❌ | — | — |
| `organization.removeMember` | M | 👑 | ❌ | — | — |
| `organization.resetMemberPassword` | M | 👑 | ❌ | — | — |

---

## 2. Chat / Agent Operations

### 2a. Streaming chat (REST, not tRPC)

| Frontend call | Purpose | Rec. | Django endpoint | Status |
|---|---|---|---|---|
| `POST /api/agent` (SSE) | Send message, stream response | ✅ | `POST /api/agent/` (SSE) | ⬜ |
| `POST /api/test/run` | One-shot eval / no-persist | ❌ | — | — |

> **Design decision needed:** match the Vercel AI SDK message-parts protocol on Django, or emit a simpler SSE format and rewrite the chat-message React components. Matching is ~200 lines of Python and lets the UI work unchanged.

### 2b. Chat CRUD

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `chat.list` | Q | 🔒 | ✅ | `GET /api/chats/` | ⬜ |
| `chat.get` | Q | 🔒 | ✅ | `GET /api/chats/:id/` | ⬜ |
| `chat.search` | Q | 🔒 | ✅ | `GET /api/chats/search/?q=…` | ⬜ |
| `chat.rename` | M | 🔒 | ✅ | `PATCH /api/chats/:id/` | ⬜ |
| `chat.delete` | M | 🔒 | ✅ | `DELETE /api/chats/:id/` | ⬜ |
| `chat.deleteAllNonStarred` | M | 🔒 | ⚠️ | `POST /api/chats/bulk-delete-non-starred/` | ⬜ |
| `chat.toggleStarred` | M | 🔒 | ✅ | `PATCH /api/chats/:id/star/` | ⬜ |
| `chat.stop` | M | 🔒 | ✅ | `POST /api/chats/:id/stop/` | ⬜ |
| `chat.getContextUsage` | Q | 🔒 | ⚠️ *(the context-window indicator in chat)* | `GET /api/chats/:id/context-usage/` | ⬜ |
| `chat.getForkMetadata` | Q | 🔒 | ❌ *(chat-fork feature)* | — | — |

### 2c. Chat forking (branch a chat from a shared one)

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `chatFork.fork` | M | 🔒 | ❌ *(rarely-used advanced feature)* | — | — |
| `chatFork.getSelectionForks` | Q | 🔒 | ❌ | — | — |

### 2d. Feedback

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `feedback.submit` | M | 🔒 | ✅ | `POST /api/messages/:id/feedback/` | ⬜ |
| `feedback.getRecent` | Q | 👑 | ❌ *(admin dashboard)* | — | — |

### 2e. Citations

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `citation.get` | Q | 🔒 | ✅ *(powers the "where did this number come from?" popover)* | `GET /api/queries/:queryId/citations/?column=…` | ⬜ |

### 2f. Transcribe (voice input)

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `transcribe.transcribe` | M | 🔒 | ⚠️ *(voice-to-text button — drop if you don't want mic input)* | `POST /api/transcribe/` | ⬜ |
| `transcribe.getModels` | Q | 🔒 | ⚠️ | `GET /api/transcribe/models/` | ⬜ |

### 2g. Shared chats (publish a chat for teammates)

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `sharedChat.list` | Q | 🔒 | ❌ | — | — |
| `sharedChat.create` | M | 🔒 | ❌ | — | — |
| `sharedChat.getSharedChat` | Q | 🔒 | ❌ | — | — |
| `sharedChat.getShareOptionsByChatId` | Q | 🔒 | ❌ | — | — |
| `sharedChat.updateAccess` | M | 🔒 | ❌ | — | — |
| `sharedChat.delete` | M | 🔒 | ❌ | — | — |

---

## 3. Stories (analytics artifacts)

### 3a. Story lifecycle

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `story.listAll` | Q | 🔒 | ⚠️ | `GET /api/stories/` | ⬜ |
| `story.listArchived` | Q | 🔒 | ⚠️ | `GET /api/stories/archived/` | ⬜ |
| `story.listStories` | Q | 🔒 | ✅ *(stories in a chat)* | `GET /api/chats/:chatId/stories/` | ⬜ |
| `story.getLatest` | Q | 🔒 | ✅ | `GET /api/chats/:chatId/stories/:slug/` | ⬜ |
| `story.listVersions` | Q | 🔒 | ✅ | `GET /api/chats/:chatId/stories/:slug/versions/` | ⬜ |
| `story.createVersion` | M | 🔒 | ✅ *(save an edited query)* | `POST /api/chats/:chatId/stories/:slug/versions/` | ⬜ |
| `story.refreshData` | M | 🔒 | ✅ | `POST /api/chats/:chatId/stories/:slug/refresh/` | ⬜ |
| `story.getLiveQueryData` | Q | 🔒 | ✅ | `GET /api/chats/:chatId/queries/:queryId/live/` | ⬜ |
| `story.updateLiveSettings` | M | 🔒 | ⚠️ *(scheduled refresh)* | `PATCH /api/chats/:chatId/stories/:slug/live-settings/` | ⬜ |
| `story.parseCronFromText` | M | 🔒 | ⚠️ *(depends on live settings above)* | `POST /api/util/cron-from-text/` | ⬜ |
| `story.archive` | M | 🔒 | ⚠️ | `POST /api/chats/:chatId/stories/:slug/archive/` | ⬜ |
| `story.unarchive` | M | 🔒 | ⚠️ | `POST /api/chats/:chatId/stories/:slug/unarchive/` | ⬜ |
| `story.archiveMany` | M | 🔒 | ❌ *(bulk op — low-value)* | — | — |
| `story.download` | Q | 🔒 | ✅ *(CSV / Excel / PDF export)* | `GET /api/chats/:chatId/stories/:slug/download/?format=…` | ⬜ |

### 3b. Shared stories

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `storyShare.list` | Q | 🔒 | ❌ | — | — |
| `storyShare.create` | M | 🔒 | ❌ | — | — |
| `storyShare.get` | Q | 🔒 | ❌ | — | — |
| `storyShare.getLiveQueryData` | Q | 🔒 | ❌ | — | — |
| `storyShare.refreshData` | M | 🔒 | ❌ | — | — |
| `storyShare.findByStory` | Q | 🔒 | ❌ | — | — |
| `storyShare.updateAccess` | M | 🔒 | ❌ | — | — |
| `storyShare.delete` | M | 🔒 | ❌ | — | — |
| `storyShare.download` | Q | 🔒 | ❌ *(use the non-shared `story.download`)* | — | — |

---

## 4. Memory

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `memory.setEnabled` | M | 🔒 | ✅ | `PATCH /api/users/me/memory-settings/` | ⬜ |
| `memory.edit` | M | 🔒 | ✅ | `PATCH /api/memories/:id/` | ⬜ |
| `memory.delete` | M | 🔒 | ✅ | `DELETE /api/memories/:id/` | ⬜ |

*(read side is in `user.getMemories` / `user.getMemorySettings` above)*

---

## 5. Project & data-stack context

### 5a. Project basics

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `project.getCurrent` | Q | 🔒 | ✅ *(used everywhere)* | `GET /api/projects/current/` | ⬜ |
| `project.listForCurrentUser` | Q | 🔒 | ⚠️ *(if you only have one project, stub to a list-of-one)* | `GET /api/projects/` | ⬜ |
| `project.getAllUsersWithRoles` | Q | 🔒 | ❌ *(multi-member)* | — | — |
| `project.removeProjectMember` | M | 👑 | ❌ | — | — |

### 5b. Database / schema introspection

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `project.getDatabaseObjects` | Q | 🔒 | ✅ *(powers the @-mention picker + schema awareness)* | `GET /api/projects/current/database-objects/` | ⬜ |

### 5c. LLM provider config

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `project.getLlmConfigs` | Q | 🔒 | ✅ *(Settings → Models page)* | `GET /api/projects/current/llm-configs/` | ⬜ |
| `project.getAvailableModels` | Q | 🔒 | ✅ *(model picker in chat)* | `GET /api/projects/current/models/` | ⬜ |
| `project.getKnownModels` | Q | — | ✅ *(static catalog — could be inlined as JSON on frontend)* | `GET /api/llm/known-models/` | ⬜ |
| `project.getKnownTranscribeModels` | Q | 🔒 | ⚠️ *(only if transcribe.enabled)* | `GET /api/transcribe/known-models/` | ⬜ |
| `project.upsertLlmConfig` | M | 👑 | ✅ | `POST /api/projects/current/llm-configs/` | ⬜ |
| `project.deleteLlmConfig` | M | 👑 | ✅ | `DELETE /api/projects/current/llm-configs/:provider/` | ⬜ |

### 5d. Agent settings (toggles)

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `project.getAgentSettings` | Q | 🔒 | ✅ | `GET /api/projects/current/agent-settings/` | ⬜ |
| `project.updateAgentSettings` | M | 👑 | ✅ | `PATCH /api/projects/current/agent-settings/` | ⬜ |
| `project.getMemorySettings` | Q | 🔒 | ⚠️ *(thin subset — can inline into getAgentSettings)* | `GET /api/projects/current/memory-settings/` | ⬜ |

### 5e. Saved prompts (template library)

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `project.getSavedPrompts` | Q | 🔒 | ⚠️ | `GET /api/projects/current/saved-prompts/` | ⬜ |
| `project.createSavedPrompt` | M | 👑 | ⚠️ | `POST /api/projects/current/saved-prompts/` | ⬜ |
| `project.updateSavedPrompt` | M | 👑 | ⚠️ | `PATCH /api/saved-prompts/:id/` | ⬜ |
| `project.deleteSavedPrompt` | M | 👑 | ⚠️ | `DELETE /api/saved-prompts/:id/` | ⬜ |

### 5f. Environment variables (referenced by nao_config.yaml's `env()`)

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `project.getEnvVars` | Q | 👑 | ❌ *(Django has env vars; no UI needed)* | — | — |
| `project.updateEnvVars` | M | 👑 | ❌ | — | — |

### 5g. Messaging integrations (Slack / Teams / Telegram / WhatsApp)

All 16 of these — drop the whole lot. If you ever add a Slack bot to your Django agent, build it with Django channels independently.

| Procedure | T | 🔒 | Rec. |
|---|---|---|---|
| `project.getSlackConfig` | Q | 🔒 | ❌ |
| `project.upsertSlackConfig` | M | 👑 | ❌ |
| `project.updateSlackModelConfig` | M | 👑 | ❌ |
| `project.deleteSlackConfig` | M | 👑 | ❌ |
| `project.getTeamsConfig` | Q | 🔒 | ❌ |
| `project.upsertTeamsConfig` | M | 👑 | ❌ |
| `project.updateTeamsModelConfig` | M | 👑 | ❌ |
| `project.deleteTeamsConfig` | M | 👑 | ❌ |
| `project.getTelegramConfig` | Q | 🔒 | ❌ |
| `project.upsertTelegramConfig` | M | 👑 | ❌ |
| `project.updateTelegramModelConfig` | M | 👑 | ❌ |
| `project.deleteTelegramConfig` | M | 👑 | ❌ |
| `project.getWhatsappConfig` | Q | 🔒 | ❌ |
| `project.upsertWhatsappConfig` | M | 👑 | ❌ |
| `project.updateWhatsappModelConfig` | M | 👑 | ❌ |
| `project.deleteWhatsappConfig` | M | 👑 | ❌ |

Plus messaging-link companions — also drop:

| Procedure | Rec. |
|---|---|
| `project.getCurrentUserWhatsappLinks` | ❌ |
| `project.unlinkCurrentUserWhatsappLink` | ❌ |
| `project.getCurrentUserMessagingProviderCode` | ❌ |
| `project.regenerateCurrentUserMessagingProviderCode` | ❌ |

### 5h. Admin inspection

| Procedure | T | 🔒 | Rec. |
|---|---|---|---|
| `project.getProjectChats` | Q | 👑 | ❌ *(admin cross-user chat browser)* |
| `project.getChatReplay` | Q | 👑 | ❌ |

---

## 6. MCP servers & skills (tool extensions)

### 6a. MCP

| Procedure | T | 🔒 | Rec. |
|---|---|---|---|
| `mcp.getState` | Q | 🔒 | ❌ *(unless you add MCP to your Django agent)* |
| `mcp.reconnect` | M | 👑 | ❌ |
| `mcp.toggleTool` | M | 👑 | ❌ |
| `mcp.setAllServerTools` | M | 👑 | ❌ |

> **Note:** `mcp.getState` is referenced twice in app bootstrap queries. If you drop it, stub the endpoint to return `{ servers: [] }` so the chat page loads without errors.

### 6b. Skills

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `skill.list` | Q | 🔒 | ⚠️ *(stub to `[]` if you have no skills)* | `GET /api/projects/current/skills/` | ⬜ |

---

## 7. Context explorer (admin file browser)

| Procedure | T | 🔒 | Rec. |
|---|---|---|---|
| `contextExplorer.getFileTree` | Q | 👑 | ❌ |
| `contextExplorer.readFile` | Q | 👑 | ❌ |

---

## 8. Budgets (LLM spend caps)

| Procedure | T | 🔒 | Rec. |
|---|---|---|---|
| `budget.getProvidersCostSupport` | Q | 🔒 | ❌ |
| `budget.getBudgets` | Q | 🔒 | ❌ |
| `budget.getProviderCosts` | Q | 🔒 | ❌ |
| `budget.checkBudgetStatus` | Q | 🔒 | ❌ |
| `budget.setBudgets` | M | 👑 | ❌ |

---

## 9. GitHub integration (for cloning repos into projects)

All 6 — drop; you're not using GitHub as a project source.

| Procedure | T | 🔒 | Rec. |
|---|---|---|---|
| `github.isAvailable` | Q | 🔒 | ❌ |
| `github.getStatus` | Q | 🔒 | ❌ |
| `github.listRepos` | Q | 🔒 | ❌ |
| `github.createProjectFromRepo` | M | 🔒 | ❌ |
| `github.getProjectGitInfo` | Q | 👑 | ❌ |
| `github.pullProject` | M | 👑 | ❌ |

---

## 10. Observability (logs, usage, analytics)

| Procedure | T | 🔒 | Rec. |
|---|---|---|---|
| `log.getLogs` | Q | 👑 | ❌ *(Django has its own logging)* |
| `usage.getMessagesUsage` | Q | 👑 | ❌ |
| `usage.getUsedProviders` | Q | 👑 | ❌ |
| `posthog.getConfig` | Q | — | ❌ *(unless you wire up PostHog in Django)* |

---

## 11. System

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `system.getPublicConfig` | Q | — | ✅ *(UI checks e.g. `naoMode` at bootstrap)* | `GET /api/system/config/` | ⬜ |
| `system.version` | Q | 👑 | ❌ | — | — |

---

## 12. Chart delivery

| Procedure | T | 🔒 | Rec. | Django endpoint | Status |
|---|---|---|---|---|---|
| `chart.download` | Q | 🔒 | ✅ *(fresh PNG render)* | `GET /api/tool-calls/:toolCallId/chart.png` | ⬜ |
| REST: `GET /c/:chatId/:chartId.png` | REST | ✅ *(cached PNG)* | `GET /api/chats/:chatId/charts/:id.png` | ⬜ |
| REST: `GET /i/:imageId` | REST | ✅ *(message images)* | `GET /api/images/:id/` | ⬜ |

---

## Totals (my recommendation)

| Category | Keep | Drop | Optional |
|---|---|---|---|
| Auth / user / identity | 4 | 17 | 4 |
| Chat + agent | 9 | 8 | 4 |
| Stories | 8 | 10 | 7 |
| Memory | 3 | 0 | 0 |
| Project / LLM / agent settings | 9 | 34 | 5 |
| MCP / skills / context / budgets | 0 | 11 | 1 |
| GitHub / logs / usage / system | 1 | 10 | 0 |
| Charts / images | 3 | 0 | 0 |
| **TOTAL (recommended)** | **~27** | **~90** | **~21** |

So the **Django surface is ~27 endpoints** for a minimal build, or ~45 if you include every ⚠️ optional.

---

## Your turn

Go through the tables. Replace any ❌ you want to keep, or ✅ you want to drop. When you're done:

1. **Anything left with ✅** → write a Django view for it. Use the suggested path or your own.
2. **Anything left with ❌** → delete the frontend UI that calls it (Phase 4 in our earlier plan).
3. **Anything left with ⚠️** → decide per-feature; usually "keep if the corresponding UI looks useful, drop if the feature is noise."

Come back with the revised list and we'll prioritise build order + identify the Django models you'll need.
