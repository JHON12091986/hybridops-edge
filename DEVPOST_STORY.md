## Inspiration
During infrastructure incidents, engineers face high-volume logs, CPU/memory contention, and degraded network links. **HybridOps Edge** explores hybrid incident and log triage using **Firebase AI Logic** (`firebase/ai`), supporting `PREFER_ON_DEVICE`, `ONLY_IN_CLOUD`, and `ONLY_ON_DEVICE` modes so local execution can run when available and cloud Gemini models can serve as fallback or full cloud execution.

## What It Does
- **Multi-Mode Hybrid Inference**: Switches between `PREFER_ON_DEVICE` (local first with cloud fallback), `ONLY_IN_CLOUD`, and `ONLY_ON_DEVICE` directly in the UI.
- **Structured SRE Triage**: Correlates raw logs and telemetry—such as `ERR_TLS_HANDSHAKE_TIMEOUT`, high worker node memory usage (`92%`, `oom_score_adj=500`), and `auth-gateway` healthcheck latency (`5020 ms`)—into **1) Summary**, **2) Likely Root Cause**, and **3) Immediate Action Steps**.
- **Latency & Scenario Controls**: Tracks execution time (`ms`) per run, includes preset incident log scenarios, and lets operators copy the generated triage report.

## How We Built It
- **Frontend & Tooling**: Built with Vite and JavaScript (`src/main.js`) for fast local iteration and interactive mode testing.
- **Firebase AI Logic & App Check**: Integrated `firebase/app`, `firebase/app-check`, and `firebase/ai` (`getAI`, `getGenerativeModel`, `GoogleAIBackend`, `InferenceMode`) in `src/services/hybridAi.js`, caching initialized Firebase/AI instances and mode-specific models to reduce repeated setup overhead.

## Challenges We Faced
- **Hybrid Mode & Latency Optimization**: Initial `PREFER_ON_DEVICE` triage took `47732 ms`; instance/model caching and prompt tightening brought subsequent runs down to `16432 ms`–`17851 ms`, while `ONLY_ON_DEVICE` completed in `14711 ms` in local testing.
- **Cloud Config & App Check Verification**: Resolved local App Check debug token setup and surfaced explicit diagnostics when `ONLY_IN_CLOUD` encounters missing `genai` provider configuration (`400`) in the Firebase project.

## What's Next
- Complete cloud `genai` provider configuration to compare `ONLY_IN_CLOUD` vs. `ONLY_ON_DEVICE` vs. `PREFER_ON_DEVICE` latency side by side.
- Add exportable Markdown/JSON incident handoff bundles and custom log parsers.