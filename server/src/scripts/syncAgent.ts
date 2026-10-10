// Creates the Aangan agent on Vaani (first run) or pushes the latest prompt/extraction config.
//   npm run agent:sync
// The prompt embeds today's date so the agent can judge "before Diwali" — the server re-runs
// this daily (see jobs.ts) to keep the date current.

import { setEnvVar } from "./envfile.js";
import { config } from "../config.js";
import { vaaniApi } from "../vaani/client.js";
import { AGENT_NAME, agentConfigPayload } from "../vaani/agentConfig.js";

export async function syncAgent(log = console.log) {
  const payload = agentConfigPayload();
  let agentId = config.vaani.agentId;
  if (!agentId) {
    const existing = (await vaaniApi.listAgents()).find((a) => a.display_name === AGENT_NAME);
    agentId = existing?.id ?? (await vaaniApi.createAgent(AGENT_NAME)).agent_id;
    config.vaani.agentId = agentId;
    persistAgentId(agentId);
    log(`Agent id: ${agentId} (saved to .env as VAANI_AGENT_ID)`);
  }
  await vaaniApi.patch(agentId, "persona", payload.persona);
  const after = await vaaniApi.patch(agentId, "analysis", payload.analysis);
  if (after?.warnings?.length) log("Vaani warnings:", after.warnings);
  log(`Synced "${AGENT_NAME}" (${agentId})`);
  return agentId;
}

function persistAgentId(id: string) {
  try {
    setEnvVar("VAANI_AGENT_ID", id);
  } catch {
    /* running without a .env file (e.g. hosted) — set VAANI_AGENT_ID manually */
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncAgent().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
