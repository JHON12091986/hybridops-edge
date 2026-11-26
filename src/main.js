import "./style.css";
import { analyzeIncident, InferenceMode } from "./services/hybridAi.js";

const PRESETS = {
  gateway_tls_oom: `[2026-11-26 14:12:04] ERR_TLS_HANDSHAKE_TIMEOUT upstream=api.internal:8443 retry=3
[2026-11-26 14:12:09] WARN worker-node-04 memory_usage=92% oom_score_adj=500
[2026-11-26 14:12:15] CRIT healthcheck failed for service=auth-gateway latency_ms=5020`,
  memory_oom: `[2026-11-26 15:02:11] WARN db-replica-02 memory_usage=95% swap_used_mb=2048
[2026-11-26 15:02:14] ERR kernel: Out of memory: Killed process 4812 (postgres-worker)
[2026-11-26 15:02:18] CRIT connection_pool_exhausted service=billing-api active=200/200`,
  upstream_dns: `[2026-11-26 15:20:01] ERR DNS_PROBE_FINISHED_NXDOMAIN host=payments.internal
[2026-11-26 15:20:05] WARN ingress-proxy upstream_connect_timeout=3000ms route=/v1/checkout
[2026-11-26 15:20:09] CRIT error_rate=18.4% service=checkout-router status=502`
};

const app = document.querySelector("#app");

app.innerHTML = `
  <main style="max-width: 860px; margin: 2rem auto; font-family: system-ui, sans-serif; padding: 0 1rem;">
    <div style="display:flex; justify-content:space-between; align-items:baseline; gap:1rem; flex-wrap:wrap;">
      <div>
        <h1 style="margin:0;">HybridOps Edge</h1>
        <p style="margin:0.35rem 0 0; color:#555;">Hybrid AI incident & log triage powered by <strong>Firebase AI Logic</strong> (<code>PREFER_ON_DEVICE</code> · <code>ONLY_IN_CLOUD</code> · <code>ONLY_ON_DEVICE</code>).</p>
      </div>
      <span id="telemetryBadge" style="font-size:0.85rem; padding:0.35rem 0.65rem; border-radius:999px; background:#eef2ff; color:#1e3a8a; font-weight:600;">
        Last run: --
      </span>
    </div>

    <div style="display:flex; gap:1rem; flex-wrap:wrap; align-items:end; margin-top:1rem;">
      <div style="flex:1; min-width:260px;">
        <label for="modeSelect" style="display:block; font-weight:600;">Inference Mode</label>
        <select id="modeSelect" style="padding:0.5rem; margin-top:0.25rem; width:100%;">
          <option value="PREFER_ON_DEVICE" selected>PREFER_ON_DEVICE (Local first, Cloud fallback)</option>
          <option value="ONLY_IN_CLOUD">ONLY_IN_CLOUD (Cloud Gemini)</option>
          <option value="ONLY_ON_DEVICE">ONLY_ON_DEVICE (Local only)</option>
        </select>
      </div>

      <div style="flex:1; min-width:260px;">
        <label for="presetSelect" style="display:block; font-weight:600;">Sample Incident Scenario</label>
        <select id="presetSelect" style="padding:0.5rem; margin-top:0.25rem; width:100%;">
          <option value="gateway_tls_oom" selected>TLS Handshake + Worker OOM + Gateway</option>
          <option value="memory_oom">OOM Killer + DB Replica Pressure</option>
          <option value="upstream_dns">DNS Resolution + 502 Checkout Spike</option>
        </select>
      </div>
    </div>

    <label for="logInput" style="display:block; margin-top:1rem; font-weight:600;">Incident Logs / Telemetry</label>
    <textarea id="logInput" rows="7" style="width:100%; padding:0.75rem; margin-top:0.25rem; font-family:monospace;">${PRESETS.gateway_tls_oom}</textarea>

    <div style="display:flex; gap:0.75rem; flex-wrap:wrap; margin-top:1rem;">
      <button id="runBtn" type="button" style="padding:0.65rem 1.25rem; font-weight:600; cursor:pointer;">
        Run Hybrid Triage
      </button>
      <button id="copyBtn" type="button" style="padding:0.65rem 1rem; cursor:pointer;">
        Copy Report
      </button>
    </div>

    <section id="outputBox" style="margin-top:1.5rem; padding:1rem; border:1px solid #ccc; border-radius:8px; white-space:pre-wrap; background:#fafafa; color:#111;">
      Ready. Click "Run Hybrid Triage" to test.
    </section>
  </main>
`;

const runBtn = document.querySelector("#runBtn");
const copyBtn = document.querySelector("#copyBtn");
const modeSelect = document.querySelector("#modeSelect");
const presetSelect = document.querySelector("#presetSelect");
const logInput = document.querySelector("#logInput");
const outputBox = document.querySelector("#outputBox");
const telemetryBadge = document.querySelector("#telemetryBadge");

presetSelect.addEventListener("change", () => {
  const nextPreset = PRESETS[presetSelect.value];
  if (nextPreset) {
    logInput.value = nextPreset;
  }
});

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(outputBox.textContent || "");
    const prev = copyBtn.textContent;
    copyBtn.textContent = "Copied!";
    setTimeout(() => {
      copyBtn.textContent = prev;
    }, 1400);
  } catch {
    outputBox.textContent += "\n\n[Clipboard permission unavailable — select text manually.]";
  }
});

runBtn.addEventListener("click", async () => {
  const raw = logInput.value.trim();
  if (!raw) {
    outputBox.textContent = "Please enter logs or incident notes first.";
    return;
  }

  const selectedMode = InferenceMode[modeSelect.value] ?? InferenceMode.PREFER_ON_DEVICE;
  runBtn.disabled = true;
  outputBox.textContent = `Running (` + modeSelect.value + `)...`;

  try {
    const { text, elapsedMs } = await analyzeIncident(raw, selectedMode);
    telemetryBadge.textContent = `Last run: ` + modeSelect.value + ` · ` + elapsedMs + ` ms`;
    outputBox.textContent = `[Mode: ` + modeSelect.value + ` | Time: ` + elapsedMs + ` ms]\n\n` + text;
  } catch (err) {
    telemetryBadge.textContent = `Last run: ` + modeSelect.value + ` · Error`;
    outputBox.textContent = "Error: " + (err?.message || String(err));
  } finally {
    runBtn.disabled = false;
  }
});