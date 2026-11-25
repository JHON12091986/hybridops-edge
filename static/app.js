const sdkStatus = document.getElementById("sdkStatus");
const outBox = document.getElementById("outBox");

function bindFirebase() {
  const apiKey = document.getElementById("fbApiKey").value.trim();
  const projectId = document.getElementById("fbProjectId").value.trim();
  const appId = document.getElementById("fbAppId").value.trim();
  const appCheckKey = document.getElementById("fbAppCheck").value.trim();

  if (apiKey && projectId && appId) {
    window.FIREBASE_CONFIG = { apiKey, projectId, appId };
    window.FIREBASE_APPCHECK_KEY = appCheckKey;
    sdkStatus.textContent = "Firebase AI Logic config bound (Hybrid mode ready)";
  } else {
    window.FIREBASE_CONFIG = null;
    sdkStatus.textContent = "Local hybrid fallback active (no Firebase config set)";
  }
}

async function refreshTelemetry() {
  const [mRes, tRes] = await Promise.all([
    fetch("/api/metrics"),
    fetch("/api/triage?limit=8")
  ]);
  if (!mRes.ok || !tRes.ok) return;

  const metrics = await mRes.json();
  const records = await tRes.json();

  document.getElementById("mTotal").textContent = String(metrics.total_triaged);
  document.getElementById("mRatio").textContent = String(metrics.on_device_ratio_pct) + "%";
  document.getElementById("mOdLat").textContent = String(metrics.avg_on_device_latency_ms) + " ms";
  document.getElementById("mClLat").textContent = String(metrics.avg_cloud_latency_ms) + " ms";

  const hist = document.getElementById("historyList");
  if (!records.length) {
    hist.textContent = "No records yet.";
    return;
  }

  hist.innerHTML = records.map(function (r) {
    return (
      "<div class=\"history-item\">" +
      "<div><strong>" + r.ticket_id + "</strong>" +
      "<span class=\"pill " + r.execution_source + "\">" + r.execution_source + "</span>" +
      "<span class=\"pill " + r.sla_risk_level + "\">" + r.sla_risk_level + " (" + r.urgency_score + ")</span></div>" +
      "<div style=\"margin-top:4px; color:#e6ecff;\">" + r.title + "</div>" +
      "<div style=\"font-size:0.76rem; margin-top:2px;\">Latency: " + r.latency_ms + " ms | SLA: " + r.sla_minutes_remaining + "m</div>" +
      "</div>"
    );
  }).join("");
}

async function runTriage() {
  try {
    outBox.textContent = "Executing hybrid triage...";
    const ticketId = document.getElementById("ticketId").value.trim() || "INC-4092";
    const title = document.getElementById("incidentTitle").value.trim() || "Incident Triage";
    const rawLogs = document.getElementById("rawLogs").value.trim() || "Diagnostic logs";
    const slaMinutes = parseInt(document.getElementById("slaMinutes").value || "30", 10);
    const businessBlocked = document.getElementById("businessBlocked").value === "true";

    const t0 = performance.now();
    const ipRegex = new RegExp("\\b\\d{1,3}(?:\\.\\d{1,3}){3}\\b", "g");
    const redactedLogs = rawLogs.replace(ipRegex, "[REDACTED_IP]");

    let aiSummary = "Redacted summary: " + redactedLogs;
    let executionSource = "simulated-fallback";

    if (window.FIREBASE_CONFIG) {
      try {
        const fbAppMod = await import("https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js");
        const fbCheckMod = await import("https://www.gstatic.com/firebasejs/12.5.0/firebase-app-check.js");
        const fbAiMod = await import("https://www.gstatic.com/firebasejs/12.5.0/firebase-ai.js");

        const app = fbAppMod.getApps().length ? fbAppMod.getApps()[0] : fbAppMod.initializeApp(window.FIREBASE_CONFIG);
        if (window.FIREBASE_APPCHECK_KEY) {
          self.FIREBASE_APPCHECK_DEBUG_TOKEN = window.FIREBASE_APPCHECK_KEY;
          fbCheckMod.initializeAppCheck(app, {
            provider: new fbCheckMod.ReCaptchaEnterpriseProvider(window.FIREBASE_APPCHECK_KEY),
            isTokenAutoRefreshEnabled: true
          });
        }
        const ai = fbAiMod.getAI(app, { backend: new fbAiMod.GoogleAIBackend() });
        const model = fbAiMod.getGenerativeModel(ai, {
          mode: fbAiMod.InferenceMode.PREFER_ON_DEVICE,
          model: "gemini-2.5-flash"
        });
        const res = await model.generateContent("Triage ticket " + ticketId + ": " + title + ". Logs: " + rawLogs);
        aiSummary = res.response.text();
        executionSource = "on-device";
        sdkStatus.textContent = "Firebase AI Logic SDK executed";
      } catch (sdkErr) {
        executionSource = "simulated-fallback";
        sdkStatus.textContent = "Firebase AI Logic fallback active";
        console.warn("Firebase AI fallback:", sdkErr);
      }
    }

    const latencyMs = Math.round((performance.now() - t0) * 100) / 100;

    const savedRes = await fetch("/api/triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticket_id: ticketId,
        title: title,
        raw_input: rawLogs,
        ai_summary: aiSummary,
        recommended_action: "Verify PSU BIST, test display cable/port, and escalate if hardware fault persists.",
        execution_source: executionSource,
        latency_ms: latencyMs,
        business_blocked: businessBlocked,
        sla_minutes_remaining: slaMinutes
      })
    });

    if (!savedRes.ok) {
      const errText = await savedRes.text();
      throw new Error("HTTP " + savedRes.status + ": " + errText);
    }

    const saved = await savedRes.json();
    outBox.textContent = JSON.stringify(saved, null, 2);
    await refreshTelemetry();
  } catch (err) {
    outBox.textContent = "Error executing triage:\n" + (err && err.message ? err.message : String(err));
  }
}

document.getElementById("connectFbBtn").addEventListener("click", bindFirebase);
document.getElementById("runTriageBtn").addEventListener("click", runTriage);
document.getElementById("refreshBtn").addEventListener("click", refreshTelemetry);
refreshTelemetry();
