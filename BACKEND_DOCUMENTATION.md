# GlobalRisk Intelligence Platform - Backend Architecture & Workflow

## 1. Overview and Core Functionality
The backend of the GlobalRisk Intelligence Platform serves as the central nervous system for calculating, streaming, and storing risk data for maritime, aviation, and railway logistics. It is designed to be highly concurrent, capable of handling real-time data streams (like AIS vessel pings), running machine learning anomaly detection, and interacting with Large Language Models (LLMs) to generate human-readable underwriting reports.

## 2. Technology Stack & "Why?"

### Framework: FastAPI (Python 3.12+)
*   **What it is:** A modern, incredibly fast web framework for building APIs with Python, based on standard Python type hints.
*   **Why it's used:**
    *   **Asynchronous Native:** Logistics tracking (like the Live AIS Tracker) requires handling thousands of concurrent connections. FastAPI's native support for Python `async/await` allows it to handle WebSockets and I/O-bound tasks (like database queries and external API calls) asynchronously without blocking the main server thread.
    *   **Speed:** It is one of the fastest Python frameworks available, rivaling NodeJS and Go.
    *   **Automatic Validation:** It uses Pydantic under the hood to automatically validate all incoming payload data against strict schemas, preventing malformed data from crashing the ML models or database.

### Real-Time Communication: WebSockets
*   **What it is:** A protocol providing full-duplex communication channels over a single TCP connection.
*   **Why it's used:** HTTP is stateless and requires the client to constantly "ask" the server for updates (polling). WebSockets allow the server to "push" live tracking data (vessel coordinates, real-time alerts) to the React frontend the millisecond it happens. This powers the "Live AIS Tracking" dashboard seamlessly.

### Database: Supabase (PostgreSQL)
*   **What it is:** An open-source Firebase alternative built on top of a highly scalable PostgreSQL database.
*   **Why it's used:**
    *   **Relational Integrity:** Insurance portfolios require strict relational data structures (e.g., a Policy belongs to a Vessel, a Vessel belongs to a Portfolio).
    *   **Performance:** PostgreSQL is an enterprise-grade database capable of handling complex spatial queries (if expanded with PostGIS) and large analytical datasets.

### Machine Learning: Scikit-Learn & CatBoost/XGBoost
*   **What it is:** Industry-standard Python libraries for data science and machine learning.
*   **Why it's used:**
    *   **Isolation Forest (`anomaly_detector.py`):** Used to detect strange vessel behavior in real-time. It's an unsupervised learning algorithm that excels at finding outliers in multi-dimensional data (e.g., detecting if a ship's speed, course, and location combination are highly unusual).
    *   **CatBoost Ensemble:** Used for calculating the 5-dimensional risk breakdowns. CatBoost handles categorical data exceptionally well without massive pre-processing.

### Artificial Intelligence: Groq API (Llama 3)
*   **What it is:** An ultra-fast inference engine running open-source models like Llama 3.3.
*   **Why it's used:** Used in the "Cargo Risk Simulator". While ML models output raw numbers (e.g., "Risk: 82"), insurance underwriters need context. The LLM takes the raw data and generates a structured, professional narrative explaining *why* the risk is 82, formatted strictly as JSON so the frontend can parse it. Groq was chosen for its unparalleled token-generation speed.

## 2.5 Core Python Libraries & Dependencies
Beyond the foundational architecture, the backend relies on specific Python packages (defined in `requirements.txt`/`pyproject.toml`) to handle the heavy lifting:

1.  **`pydantic` & `pydantic-settings`:**
    *   **Role:** Data validation and Settings Management.
    *   **Usage:** Every incoming JSON payload from the React frontend (like creating a new simulated voyage or a new AIS ping) is cast into a `Pydantic BaseModel`. This ensures that if a field like `latitude` is expected to be a `float`, Pydantic forces it to be a float or instantly rejects the API request with a 422 Error before it can corrupt the database or crash the ML models.
2.  **`uvicorn`:**
    *   **Role:** The ASGI (Asynchronous Server Gateway Interface) Web Server.
    *   **Usage:** FastAPI is just the framework; `uvicorn` is the actual engine running the application. It handles the low-level TCP sockets and HTTP parsing, passing the completely formed async requests up to FastAPI.
3.  **`httpx`:**
    *   **Role:** Asynchronous HTTP Client.
    *   **Usage:** Whenever the backend needs to talk to the Groq API (for the LLM) or potentially external weather APIs, it uses `httpx`. Unlike the standard `requests` library (which is synchronous and would block the entire server while waiting for the LLM), `httpx` allows making these external calls natively via `async/await`.
4.  **`supabase` (Python Client):**
    *   **Role:** Database ORM / Client.
    *   **Usage:** Connects to the hosted PostgreSQL instance, primarily used in this application to persist historical simulation data, user policies, and retrieve structured geospatial polygon definitions for the compliance engine.
5.  **`joblib`:**
    *   **Role:** Model Serialization.
    *   **Usage:** Used to instantaneously load the pre-trained `isolation_forest.joblib` and CatBoost models from disk into RAM when the FastAPI server boots up, ensuring the ML inference endpoints have zero "cold start" latency.
6.  **`python-dotenv`:**
    *   **Role:** Environment Management.
    *   **Usage:** Securely loads the `.env` file containing the `SUPABASE_KEY` and `GROQ_API_KEY` into the server's environment variables, meaning secrets are never hardcoded into the repository.

---

## 3. Core Backend Workflows

### A. The Live AIS Tracking / Compliance Engine Workflow
1.  **Ingestion:** The `demo_compliance.py` script acts as a simulated satellite network, continuously POSTing vessel coordinates (pings) to the `/api/ais/ping` endpoint.
2.  **Validation:** FastAPI and Pydantic instantly validate that the payload has the correct format (MMSI, lat, lon, heading, speed).
3.  **State Updating:** The `AISService` (in `backend/services/ais_service.py`) updates its in-memory state dictionary with the vessel's latest position.
4.  **Compliance Checking:** The `ComplianceEngine` scans the vessel's coordinates against predefined geographical polygons (Risk Zones, like the Strait of Malacca).
5.  **Alert Generation:** If a vessel intersects a risk polygon or the ML Isolation Forest detects anomalous speed/heading, an `AISAlert` is generated.
6.  **Streaming:** The `AISService` broadcasts the updated vessel state and any new alerts across all active WebSocket connections to the frontend.

### B. The AI Scenario Simulation Workflow
1.  **Request:** The frontend sends a simulation payload containing cargo value, origin, destination, and risk factors to `/api/ai/simulate-scenario`.
2.  **Prompt Engineering:** The `ai_router.py` constructs a highly specific system prompt containing the user's variables, instructing the LLM to act as a senior insurance underwriter.
3.  **LLM Inference:** The request is sent asynchronously to the Groq API.
4.  **Post-Processing Fix:** Because LLMs occasionally hallucinate math, the backend catches the AI's JSON response, extracts the generated `risk_breakdown` arrays, and hard-recalculates the true `overall_risk_score` by averaging the breakdown.
5.  **Response:** The scrubbed, perfectly calculated JSON is returned to the frontend.

---

## 4. Technical Judging Panel Q&A

**Q1: WebSockets on FastAPI are notoriously tricky to scale horizontally in production environments without a message broker. How are you handling broadcast state and connection drops during high-frequency telemetry bursts?**
*   **Answer:** Currently, we manage state via an in-memory `AISService` singleton wrapped with async locking mechanisms to prevent race conditions during state mutation from incoming bursts. For true horizontal scaling (e.g., across multiple pods in Kubernetes), we'd swap this in-memory pub-sub for a Redis Pub/Sub backplane. To handle connection instability, the React client implements an exponential backoff strategy for reconnection, immediately purging stale `wsRef` instances to prevent memory leaks from dead connections.

**Q2: You mentioned capturing LLM responses and stripping out hallucinated math. Does your `ai_router.py` block the main event loop while waiting for the Groq API, and what happens if the LLM refuses to return valid JSON?**
*   **Answer:** The external call to Groq is strictly awaited using Python's `asyncio` (`await httpx.AsyncClient().post()`), yielding control back to the Uvicorn event loop so other concurrent WebSocket pings continue processing. To guarantee determinism, we enforce strict JSON mode on the Groq parameters, provide a few-shot JSON schema in the system prompt, and wrap the response parsing in `try/except json.JSONDecodeError`. If parsing fails, we have a hardcoded fallback heuristic calculate the baseline risk score rather than throwing a 500 error, guaranteeing the simulation never breaks mid-demo.

**Q3: The Isolation Forest algorithm in `anomaly_detector.py` is $O(n \log n)$ complexity during training. Are you running inference on every single AIS ping simultaneously, or batching them? How do you prevent CPU contention with the async IO tasks?**
*   **Answer:** Standard scikit-learn runs synchronously and can block heavily. We isolate the ML inference payload by pre-loading the serialized `isolation_forest.joblib` model into memory at startup. When processing pings, we map the dimensions (Speed, Course difference) through quick vector math. The model itself is currently called inline due to its small tree size (virtually $O(1)$ for single-row inference). If this scaled to tens of thousands of pings per second, we'd offload the actual `model.predict()` call to an Asyncio `ThreadPoolExecutor` or a separate Celery worker queue to prevent it from starving the main network thread.

**Q4: Your geographic compliance engine utilizes Haversine calculations over multiple coordinate arrays for thousands of waypoints (e.g., Strait of Malacca risk zone). In a high-throughput environment, Python is terrible at tight computational loops. Did you implement vectorization?**
*   **Answer:** For the current iteration, we optimized the point-in-polygon checks and great-circle distances natively in Python to prioritize rapid prototyping. However, the exact architectural upgrade path involves swapping the native loops out for `numpy` vectorization or compiling the spatial logic downstream into Cython/C++ extensions. Even better, replacing the Python-level checks entirely with PostGIS running natively inside our Supabase instance, leveraging proper Spatial Indices (`GIST` indexes) to do the heavy geographic filtering prior to the python application layer.

**Q5: What are the exact structural dependencies between your ML ensemble (CatBoost/XGBoost) and the AI (Llama 3)? Are they sequential or parallel?**
*   **Answer:** They are domain-separated but complementary. The ML ensemble models are dedicated purely to historical pattern recognition based on concrete datasets (e.g., EMDAT disaster rates, AIS anomaly distributions). The LLM is strictly used for contextual synthesis and scenario simulation based on live inputs. They operate sequentially in our design pipeline: The deterministic models score the raw payload, and the LLM acts as the "final human underwriter," translating the statistical vectors into qualitative executive summaries.
