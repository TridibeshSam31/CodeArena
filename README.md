# ⚔️ CodeArena

<div align="center">

![CodeArena Banner](https://img.shields.io/badge/CodeArena-Online_Judge_Platform-blue?style=for-the-badge&logo=code&logoColor=white)

**A modern, production-grade online compiler and judge engine with asynchronous queueing, PostgreSQL persistence, and Docker-based sandbox isolation.**

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Sandbox_Isolation-2496ED?style=flat-square&logo=docker)](https://www.docker.com/)
[![Prisma](https://img.shields.io/badge/Prisma-6.x-2D3748?style=flat-square&logo=prisma)](https://prisma.io/)
[![BullMQ](https://img.shields.io/badge/BullMQ-5.x-red?style=flat-square&logo=redis)](https://bullmq.io/)
[![Redis](https://img.shields.io/badge/Redis-Queue-DC382D?style=flat-square&logo=redis)](https://redis.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-336791?style=flat-square&logo=postgresql)](https://postgresql.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)

[Live Demo](#) · [Report Bug](#) · [Request Feature](#)

</div>

---

## 📌 Table of Contents

- [Overview](#-overview)
- [Engineering Highlights](#-engineering-highlights)
- [Screenshots](#-screenshots)
- [Architecture](#-architecture)
- [Sandbox Security Hardening](#-sandbox-security-hardening)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [How It Works](#-how-it-works)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Project Structure](#-project-structure)
- [API Reference](#-api-reference)
- [Verdict System](#-verdict-system)
- [Database Schema](#-database-schema)
- [Production Readiness Checklist](#-production-readiness-checklist)
- [Contributing](#-contributing)

---

## 🌟 Overview

**CodeArena** is a full-stack online judge and code execution platform built to evaluate submitted code securely, reliably, and with low latency directly in the browser. 

Unlike naive online compilers that execute user code unsafely directly on the host machine using `child_process.exec`, CodeArena implements an industry-standard **isolated execution pipeline**:
1. **Frontend**: Monaco Editor with a CodeChef/LeetCode-inspired dark interface.
2. **Queueing**: Asynchronous BullMQ queue backed by Redis with decoupled workers.
3. **Sandbox Engine**: Ephemeral Debian Linux Docker containers running with dropped privileges, zero network access, strict PID and memory limits, and in-memory execution tmpfs.
4. **Hierarchical Timeouts**: Dual-layer timeout mechanism distinguishing inner process timeouts from outer container deadlines.
5. **Persistence**: Full execution telemetry stored in PostgreSQL via Prisma (`status`, `verdict`, `exitCode`, `executionTimeMs`, `startedAt`, `completedAt`).

---

## 🎯 Engineering Highlights

- 🐳 **Hardened Docker Sandbox** — User code runs inside isolated non-root containers (`UID 10001`) with dropped Linux capabilities, read-only rootfs, and no network access.
- ⏱️ **Dual-Layer Hierarchical Timeouts** — GNU `timeout` inner sandbox enforcement (3s limit) and outer executor deadline (15s) with automated container termination (`docker kill` & `docker rm -f`).
- 🚦 **Precise Outcome Classification** — Distinguishes `Accepted`, `Compilation Error`, `Runtime Error`, `Time Limit Exceeded`, `Output Limit Exceeded`, and `Execution Error`.
- ⚡ **Asynchronous Job Pipeline** — High-concurrency BullMQ worker decoupled from the Next.js API server to prevent CPU starvation.
- 🛡️ **Resource & Fork-Bomb Protection** — 512 MB memory ceiling, 1 CPU core allocation, 64 PID ceiling, and 1 MiB output streaming limit.
- 🗄️ **Full Telemetry Persistence** — Structured database records containing timestamps, verdicts, exit codes, and stdout/stderr.

---

## 📸 Screenshots

<div align="center">

### 1. C++ Execution — Infinite Loop & Timeout Handling
*Demonstrating sandbox isolation, GNU timeout enforcement, exit code `124` classification, and clean execution duration measurement.*
<br/>
<img src="public/screenshots/cpp-editor.png" alt="CodeArena C++ Execution — Time Limit Exceeded" width="850"/>

<br/><br/>

### 2. Python 3 Execution — Accepted & Standard Output
*Demonstrating Python unbuffered stdout capture, execution time metrics, exit code `0`, and friendly execution verdict banner.*
<br/>
<img src="public/screenshots/python-editor.png" alt="CodeArena Python Execution — Accepted" width="850"/>

<br/><br/>

### 3. C Execution — High-Performance GCC Compilation & Run
*Demonstrating C11 compilation and execution, sub-3s total roundtrip, and clean process output display.*
<br/>
<img src="public/screenshots/c-editor.png" alt="CodeArena C Execution — Accepted" width="850"/>

</div>

---

## 🏗️ Architecture

### High-Level Design (HLD)

<div align="center">
  <img src="public/Hld.png" alt="CodeArena High Level Design" width="900"/>
</div>

### Detailed Execution Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Next.js Web Client                        │
│             (Monaco Editor + Stdin + Output Panel)              │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                   POST /api/submit (JSON payload)
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Next.js API Server                        │
│   • Validates language, source code, stdin                      │
│   • Creates Submission record in PostgreSQL (status: "queued")   │
│   • Enqueues execution task into Redis via BullMQ               │
│   • Returns { submissionId } immediately (<50ms)                │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                           Redis Queue
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Dedicated Worker (tsx)                      │
│   • Dequeues job from BullMQ                                    │
│   • Updates status to "running", resets prior output/telemetry   │
│   • Writes source code to host ephemeral temp folder (0444)     │
│   • Spawns Docker sandbox process                               │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                     docker run (Isolated Sandbox)
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                   codearena-sandbox:local Container             │
│   • User: 10001:10001 (non-root)                                │
│   • Network: none (fully offline)                               │
│   • Mount: Read-only bind /workspace                            │
│   • Tmpfs: /tmp (rw, nosuid, nodev, exec, size=64m)            │
│   • Limits: 512m RAM, 1 CPU, 64 PIDs                            │
│   • Runner: /usr/local/bin/run-submission (run.sh)              │
│       ├─► Compilation timeout (10s) with clean diagnostics      │
│       └─► GNU timeout (3s) with signal escalation               │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                 Capture stdout, stderr, exit code
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Database Persistence                       │
│   • Prisma updates Submission record:                           │
│       status: "completed" | "error"                             │
│       verdict: "Accepted" | "Time Limit Exceeded" | etc.        │
│       exitCode, executionTimeMs, startedAt, completedAt         │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                   Polling: GET /api/submission/:id
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Client Output Display                      │
│   • Renders status badge, elapsed time, exit code               │
│   • Shows separated Compiler Diagnostics and Standard Output    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔒 Sandbox Security Hardening

CodeArena enforces defense-in-depth isolation across multiple layers:

| Security Vector | Implementation | Risk Mitigated |
|-----------------|----------------|----------------|
| **Network Isolation** | `--network=none` | Disables network interfaces; prevents data exfiltration, port scanning, botnets |
| **Privilege Escalation** | `--security-opt=no-new-privileges:true` | Prevents setuid binaries or privilege escalation |
| **User Identity** | `--user=10001:10001` | Runs as unprivileged `sandbox` user, never `root` |
| **Capability Dropping**| `--cap-drop=ALL` | Drops all Linux kernel capabilities (chroot, net admin, sys_admin, etc.) |
| **Root Filesystem** | `--read-only` | Root filesystem cannot be modified or corrupted by user code |
| **Source Mount** | `type=bind,source=...,target=/workspace,readonly` | User code is mounted strictly read-only (`mode: 0444`) |
| **Temporary Files** | `--tmpfs /tmp:rw,nosuid,nodev,exec,size=64m` | In-memory temporary filesystem destroyed on container exit |
| **Process Limits** | `--pids-limit=64` | Completely neutralizes fork bombs (`:(){ :|:& };:`) |
| **Memory Ceiling** | `--memory=512m --memory-swap=512m` | Hard memory limits prevent host out-of-memory (OOM) crashes |
| **CPU Ceiling** | `--cpus=1` | Limits core usage; prevents single submission CPU starvation |
| **Output Limits** | `MAX_OUTPUT_BYTES = 1024 * 1024` (1 MiB) | Stops infinite stdout flooding (`yes`, infinite printing loops) |
| **No Shell Injection**| `spawn("docker", args, { shell: false })` | Arguments passed as array without shell interpolation |

---

## ✨ Features

### Supported Languages
| Language | Standard / Version | Compiler / Runtime | Flags |
|:---|:---|:---|:---|
| **C++** | C++17 | `g++` | `-std=c++17 -O2 -pipe` |
| **C** | C11 | `gcc` | `-std=c11 -O2 -pipe` |
| **Python** | Python 3.11 | `python3` | `-u` (unbuffered streaming) |

### Execution Capabilities
- ✅ **Real-time Result Polling** with race-condition prevention (`activeRunIdRef`).
- ✅ **Compiler Diagnostic Parsing** with dedicated headings and error section formatting.
- ✅ **Unbuffered Output Streaming** ensuring stdout is never lost before process exit.
- ✅ **Custom Standard Input (stdin)** passed securely via piped streams.
- ✅ **Automatic Ephemeral Cleanup** on both host temporary directories and container instances.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: [Next.js 15 (App Router)](https://nextjs.org/)
- **Code Editor**: [@monaco-editor/react](https://github.com/suren-atoyan/monaco-react)
- **Styling**: Vanilla CSS tokens & utilities tailored for dark mode (CodeChef/LeetCode aesthetics) + Tailwind CSS v4
- **Components**: Radix UI primitives & Lucide/Hugeicons

### Backend & Queue
- **API Runtime**: Next.js Server Components & Route Handlers
- **Task Queue**: [BullMQ 5.x](https://bullmq.io/)
- **Cache & Broker**: [Redis](https://redis.io/) (Local or [Upstash](https://upstash.com/))
- **Worker Runtime**: [tsx](https://github.com/privatenumber/tsx) running native TypeScript in background process

### Database & ORM
- **Database**: [PostgreSQL](https://www.postgresql.org/) (Local or [Neon Serverless Postgres](https://neon.tech/))
- **ORM**: [Prisma 6.x](https://www.prisma.io/)

### Sandbox Runtime
- **Container Engine**: [Docker Desktop](https://www.docker.com/) / Docker Engine
- **Base Image**: `debian:bookworm-slim`
- **Runner**: Shell runner with GNU `timeout` and strict error handling (`set -eu`)

---

## ⚙️ How It Works

### Execution Telemetry Flow
```
1. Client POST /api/submit
   └─► Returns { submissionId }
2. Worker dequeues { submissionId }
   ├─► Updates status: "running", clears stale fields
   ├─► Writes host temp file: /temp/codearena-[uuid]/code.[ext]
   ├─► Runs Docker container: codearena-[uuid]
   ├─► run.sh compiles (gcc/g++) within 10s compile limit
   │     └─ If compile fails: exits with code 65 [COMPILATION_ERROR]
   ├─► run.sh executes binary under timeout 3s
   │     └─ If loop/slow: exits with code 124 (Time Limit Exceeded)
   ├─► Executor reads stdout/stderr streams up to 1 MiB
   └─► Worker commits telemetry to PostgreSQL:
         • status: "completed" | "error"
         • verdict: "Accepted" | "Compilation Error" | "Time Limit Exceeded" | etc.
         • exitCode: number | null
         • executionTimeMs: number (duration in ms)
         • startedAt / completedAt: ISO Timestamps
3. Client polls /api/submission/:id
   └─► Displays structured verdict banner, execution duration, and stream output
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** $\ge$ 18.18.0
- **Docker Desktop** running locally
- **PostgreSQL** database (Local or Neon)
- **Redis** server (Local or Upstash)

### 1. Clone & Install
```bash
git clone https://github.com/yourusername/codearena.git
cd codearena
npm install
```

### 2. Configure Environment Variables
Create `.env` in the root directory:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/codearena?sslmode=prefer"
REDIS_URL="redis://localhost:6379"
```

### 3. Build the Docker Sandbox Image
Before executing code, build the local sandbox image:
```bash
docker build -f docker/sandbox/DockerFile -t codearena-sandbox:local docker/sandbox
```

### 4. Push Database Schema
```bash
npx prisma db push
npx prisma generate
```

### 5. Start Services (In Two Terminals)

**Terminal 1 — BullMQ Execution Worker:**
```bash
npm run worker
# Output: Worker started — listening for jobs...
```

**Terminal 2 — Next.js Development Server:**
```bash
npm run dev
# Output: Ready on http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000) to start coding!

---

## 🔐 Environment Variables

| Variable | Description | Example |
|:---|:---|:---|
| `DATABASE_URL` | PostgreSQL connection string with SSL parameters | `postgresql://user:pass@host/db?sslmode=require` |
| `REDIS_URL` | Redis connection URL for BullMQ queue management | `redis://127.0.0.1:6379` or `rediss://default:...@upstash.io:6379` |

---

## 📁 Project Structure

```
codearena/
├── app/
│   ├── api/
│   │   ├── submit/
│   │   │   └── route.ts          # POST /api/submit — queues code execution
│   │   └── submission/
│   │       └── [id]/
│   │           └── route.ts      # GET /api/submission/:id — returns execution state
│   ├── lib/
│   │   ├── executor.ts           # Docker sandbox runner, timeouts & output caps
│   │   ├── prisma.ts             # Prisma client singleton
│   │   ├── queue.ts              # BullMQ queue definition
│   │   └── worker.ts             # Background worker process
│   ├── globals.css               # Design system tokens & layout styling
│   ├── layout.tsx                # App root layout
│   └── page.tsx                  # Main IDE workspace & polling logic
│
├── components/
│   ├── CodeEditor.tsx            # Monaco Editor wrapper with language config
│   ├── EditorSettingsModal.tsx   # Editor settings modal (font size, tab size, wrap)
│   ├── Header.tsx                # Top navigation & running state indicator
│   ├── outputPanal.tsx           # Verdict, diagnostics & stdout display panel
│   └── stdinInput.tsx            # Standard input textarea
│
├── docker/
│   └── sandbox/
│       ├── DockerFile            # Debian bookworm-slim unprivileged image
│       └── run.sh                # GCC/G++/Python runner with GNU timeout
│
├── prisma/
│   └── schema.prisma             # PostgreSQL schema definition
│
├── public/
│   ├── Hld.png                   # High-Level Architecture Diagram
│   └── screenshots/              # Application demo screenshots
│       ├── c-editor.png
│       ├── cpp-editor.png
│       └── python-editor.png
│
├── package.json
├── tsconfig.json
└── README.md
```

---

## 📡 API Reference

### `POST /api/submit`
Enqueues a new code submission for execution.

**Request Body**
```json
{
  "code": "#include <iostream>\nint main() { std::cout << 42; return 0; }",
  "language": "cpp",
  "stdin": "10 20",
  "problemId": null
}
```

**Response (`200 OK`)**
```json
{
  "submissionId": "5639317b-644e-4ac1-a036-c29bdc3ce82f"
}
```

---

### `GET /api/submission/:id`
Retrieves execution status and telemetry for a given submission.

**Response (`200 OK` — Terminal State)**
```json
{
  "id": "5639317b-644e-4ac1-a036-c29bdc3ce82f",
  "language": "cpp",
  "problemId": null,
  "status": "completed",
  "output": "42\n",
  "stderr": "",
  "verdict": "Accepted",
  "exitCode": 0,
  "executionTimeMs": 1822,
  "startedAt": "2026-10-11T17:41:54.653Z",
  "completedAt": "2026-10-11T17:41:57.510Z",
  "createdAt": "2026-10-11T17:41:54.000Z"
}
```

---

## ⚖️ Verdict System

| Verdict | Description | Trigger Condition | Exit Code |
|:---|:---|:---|:---|
| **`Accepted`** | Program executed cleanly to completion | Program exit with code `0` | `0` |
| **`Compilation Error`** | Code failed to compile | GCC/G++ non-zero exit | `1` / `65` |
| **`Runtime Error`** | Process crashed or threw unhandled exception | Division by zero, segfault (SIGSEGV), NZEC | Non-zero (`1`, `134`, `139`) |
| **`Time Limit Exceeded`** | Program exceeded execution limit | GNU timeout reached (3s) or container outer deadline (15s) | `124` / `null` |
| **`Output Limit Exceeded`** | Combined output stream exceeded limit | Output buffer $> 1\text{ MiB}$ | `null` |
| **`Execution Error`** | Infrastructure or Docker startup failure | Docker exit code 125 or process spawn error | `125` / `null` |
| **`Unsupported Language`** | Requested language not supported | Language is not `cpp`, `c`, or `python` | HTTP `400` |

---

## 🗄️ Database Schema

```prisma
model Submission {
  id              String    @id @default(uuid())
  code            String                          // User source code
  language        String                          // "cpp" | "c" | "python"
  stdin           String?                         // Optional stdin
  status          String    @default("queued")     // queued → running → completed | error
  output          String?                         // Captured stdout
  stderr          String?                         // Captured stderr / compiler output
  verdict         String?                         // "Accepted" | "Time Limit Exceeded" | etc.
  exitCode        Int?                            // Process exit code
  executionTimeMs Int?                            // Duration in milliseconds
  startedAt       DateTime?                       // Execution start timestamp
  completedAt     DateTime?                       // Execution end timestamp
  problemId       Int?                            // Optional problem reference
  createdAt       DateTime  @default(now())
}
```

---

## 📋 Production Readiness Checklist

> **Progress: 15 / 20 checked**

### 1. Structured Logging (Phase 1)
- [x] Reusable JSON logger with log levels
- [x] Submission ID and job ID correlation
- [x] Execution lifecycle and error logs
- [x] Secrets and source code redaction

### 2. Reliability (Phase 2)
- [x] Explicit BullMQ retry and backoff policy
- [x] Job lifecycle and stuck-job recovery
- [x] Reliable container cleanup
- [x] Database failure handling and consistent status transitions

### 3. Security Hardening (Phase 3)
- [x] CPU, memory, PID, execution and output limits
- [x] Validate input and language on the server
- [x] Container isolation and least privilege
- [x] Request rate limits and abuse protection

### 4. Monitoring (Phase 4)
- [x] Health/readiness checks for API, Redis, database and worker
- [x] Queue depth and job failure metrics
- [x] Execution latency and timeout metrics
- [ ] Alerts for repeated failures and stuck jobs

### 5. Deployment Readiness (Phase 5)
- [ ] Production environment variables and secret management
- [ ] Reproducible Docker image builds
- [ ] Database migration strategy
- [ ] Automated tests, CI, deployment and rollback checks

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-new-feature`
3. Commit your changes: `git commit -m "feat: add Rust support"`
4. Push to branch: `git push origin feat/my-new-feature`
5. Open a Pull Request

---

## 📄 License

⚠️ This repository is published for learning and reference purposes. Re-uploading this codebase, removing attribution, or presenting it as your own work is strongly discouraged.

<div align="center">

**Built with ❤️ for developers interested in judge systems and system design.**

⭐ Star this repo if you found it useful!

</div>
