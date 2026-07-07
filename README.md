# ⚔️ CodeArena

<div align="center">

![CodeArena Banner](https://img.shields.io/badge/CodeArena-Online_Judge_Platform-blue?style=for-the-badge&logo=code&logoColor=white)

**A modern online judge platform with a production-inspired execution architecture — run code, submit solutions, and watch results in real-time.**

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
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
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [How It Works](#-how-it-works)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Project Structure](#-project-structure)
- [API Reference](#-api-reference)
- [Code Execution Flow](#-code-execution-flow)
- [Database Schema](#-database-schema)
- [Contributing](#-contributing)

---

## 🌟 Overview

**CodeArena** is a full-stack online judge platform that lets users write, execute, and evaluate code directly in the browser — no local setup required. Think LeetCode or Codeforces, but with a modern architecture you actually understand.

Built for developers who want to ship competitive programming tooling, run internal coding assessments, or learn how real-world judge systems work under the hood.

> This project demonstrates **backend engineering concepts** including asynchronous job queues, worker processes, isolated code execution, polling-based result delivery, and database-backed state management.

---

## 🎯 Engineering Highlights

- Asynchronous execution pipeline using BullMQ and Redis
- Separate worker process for code execution
- Process isolation with execution timeouts and automatic cleanup
- Persistent submission tracking using PostgreSQL and Prisma
- Real-time result polling from the client

---

## 📸 Screenshots

<div align="center">

### C++ Editor
<img src="public/screenshots/cpp-editor.png" alt="CodeArena C++ Editor" width="800"/>

### Python Editor
<img src="public/screenshots/python-editor.png" alt="CodeArena Python Editor" width="800"/>

### C Editor
<img src="public/screenshots/c-editor.png" alt="CodeArena C Editor" width="800"/>

</div>

---

## 🏗️ Architecture

### High-Level Design (HLD)

<div align="center">
  <img src="public/Hld.png" alt="CodeArena High Level Design" width="900"/>
</div>

The diagram above shows the full end-to-end flow:
- **User** submits code → passes through **RateLimiter** → enqueued as a job
- **Redis + BullMQ** power the Queue System with exponential backoff retries
- Jobs that repeatedly fail are routed to the **Dead Letter Queue**
- A **Worker** dequeues jobs → runs code in the **nsys code executioner** (sandboxed `child_process`)
- Execution output is **saved in PostgreSQL**
- **Frontend** polls `GET /submission/:id` to display real-time results

---

### Detailed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                         │
│   Monaco Editor + React UI  →  Polling /api/submission/:id      │
└────────────────────────┬────────────────────────────────────────┘
                         │  HTTP POST /api/submit
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NEXT.JS API ROUTES (Server)                  │
│                                                                 │
│   /api/submit        →  Creates Submission in PostgreSQL        │
│                          Pushes job → BullMQ Queue (Redis)      │
│                                                                 │
│   /api/submission/:id →  Reads Submission status from DB        │
└────────────────────────┬────────────────────────────────────────┘
                         │  Job enqueued
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BULLMQ WORKER PROCESS                       │
│                   (tsx ./app/lib/worker.ts)                      │
│                                                                 │
│   1. Dequeue job                                                │
│   2. Fetch Submission from DB                                   │
│   3. Update status → "running"                                  │
│   4. Execute code in isolated child_process                     │
│   5. Capture stdout / stderr                                    │
│   6. Update status → "completed" or "error"                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
          ┌──────────────────────────┐
          │      PostgreSQL (DB)     │
          │   Submission table       │
          │   - id, code, language   │
          │   - status, output       │
          │   - stdin, stderr        │
          └──────────────────────────┘
```

### Key Design Decisions

| Decision | Why |
|----------|-----|
| **BullMQ + Redis** for job queue | Decouples submission ingestion from execution. Handles bursts without dropping requests. Retry logic built-in. |
| **Separate Worker Process** | Code execution is CPU-heavy and potentially infinite-looping. Isolating it prevents blocking the Next.js server. |
| **Polling on client** | Simple, stateless, compatible with serverless/edge deployments. No WebSocket infrastructure needed. |
| **Prisma + PostgreSQL** | Type-safe DB access, easy migrations, ACID guarantees for submission state transitions. |
| **child_process.execSync** with timeout | Enforces a strict 5-second TLE (Time Limit Exceeded) for each submission. |

---

## ✨ Features

### Core
- 🖥️ **Monaco Editor** — The same editor that powers VS Code, with syntax highlighting, IntelliSense, and language modes for C++, C, and Python
- ⚡ **Async Execution Pipeline** — Submissions are queued and executed asynchronously via BullMQ workers
- 📊 **Real-time Status Polling** — Client polls `/api/submission/:id` until execution completes
- 🔒 **Isolated Code Execution** — Executes user code in a separate worker process with execution timeouts, temporary workspaces, and automatic cleanup
- 🗂️ **Persistent Submission History** — Every run is stored in PostgreSQL with full metadata

### Supported Languages
| Language | Compiler/Runtime | File Extension |
|----------|-----------------|---------------|
| C++ | `g++` | `.cpp` |
| C | `gcc` | `.c` |
| Python | `python3` | `.py` |

### Execution Features
- ✅ Compilation error detection (C, C++, Python SyntaxError)
- ✅ Runtime error detection
- ✅ Time Limit Exceeded (TLE) detection via `error.killed`
- ✅ Custom stdin support
- ✅ Separate stdout and stderr capture
- ✅ Temp directory cleanup after execution

---

## 🛠️ Tech Stack

### Frontend
| Technology | Purpose |
|-----------|---------|
| **Next.js 15** | Full-stack React framework with App Router |
| **@monaco-editor/react** | VS Code-grade code editor in the browser |
| **Tailwind CSS v4** | Utility-first styling with CSS variables |
| **Radix UI** | Accessible, unstyled component primitives |
| **Shadcn/ui** | Pre-built component library on top of Radix |
| **Figtree** | Custom Google Font for clean UI typography |

### Backend
| Technology | Purpose |
|-----------|---------|
| **Next.js API Routes** | REST endpoints for submission handling |
| **Prisma ORM** | Type-safe database client + migrations |
| **PostgreSQL** | Relational database for persistent submission storage |
| **BullMQ** | Job queue built on Redis for async task processing |
| **IORedis** | Redis client for BullMQ connections |

### Infrastructure
| Technology | Purpose |
|-----------|---------|
| **Redis** | Job queue backing store + BullMQ broker |
| **`child_process`** | OS-level isolated code execution |
| **`tsx`** | TypeScript-native worker script runner |
| **`os.tmpdir()`** | Ephemeral temp dirs for code file isolation |

---

## ⚙️ How It Works

### End-to-End Submission Flow

```
User writes code in Monaco Editor
         │
         ▼
POST /api/submit
  { code, language, stdin, problemId }
         │
         ├─► Validate inputs (language, required fields)
         ├─► Create Submission record in PostgreSQL (status: "pending")
         ├─► Enqueue job to BullMQ: { submissionId }
         └─► Return { submissionId } to client

Client receives submissionId
         │
         ▼
Poll GET /api/submission/:id every ~1.5s
         │
         └─► Wait until status !== "pending" && status !== "running"

BullMQ Worker picks up the job
         │
         ├─► Fetch Submission from DB
         ├─► Update status → "running"
         ├─► Create temp directory (mkdtempSync)
         ├─► Write code to temp file
         ├─► Compile (C/C++) or skip (Python)
         ├─► Execute with stdin piped
         ├─► Capture stdout/stderr
         ├─► Delete temp directory (cleanup)
         └─► Update Submission: status, output, stderr

Client poll returns completed Submission
         │
         └─► Display output/errors in OutputPanel
```

### Isolated Code Execution (executor.ts)

Each language has its own execution path:

**C++**
```
Write code.cpp → g++ compile → run main.exe < input.txt
```
**C**
```
Write code.c → gcc compile → run main.exe < input.txt
```
**Python**
```
Write code.py → python3 code.py < input.txt
```

All executions:
- Timeout enforced at **5000ms**
- Piped stdio (no terminal interaction)
- Temp directory auto-cleaned in `finally` block
- `error.killed === true` → TLE verdict

---

## 🚀 Getting Started

### Prerequisites

Make sure you have the following installed:

```bash
node >= 18.18.0
npm >= 9
g++         # For C++ execution
gcc         # For C execution
python3     # For Python execution
redis       # Local Redis instance or Upstash
postgresql  # Local or cloud (Railway, Supabase, Neon)
```

### Installation

**1. Clone the repository**
```bash
git clone https://github.com/yourusername/codearena.git
cd codearena
```

**2. Install dependencies**
```bash
npm install
```

**3. Set up environment variables**
```bash
cp .env.example .env.local
# Fill in your DATABASE_URL and REDIS_URL
```

**4. Run database migrations**
```bash
npx prisma migrate dev
npx prisma generate
```

**5. Start Redis (if running locally)**
```bash
redis-server
```

**6. Start the BullMQ Worker (separate terminal)**
```bash
npm run worker
# → "Worker started — listening for jobs..."
```

**7. Start the Next.js dev server**
```bash
npm run dev
# → Open http://localhost:3000
```

---

## 🔐 Environment Variables

Create a `.env` file in the project root:

```env
# PostgreSQL Connection String
DATABASE_URL="postgresql://user:password@localhost:5432/codearena"

# Redis Connection URL (local or Upstash)
REDIS_URL="redis://localhost:6379"
```

### Cloud Providers

| Service | DATABASE_URL format |
|---------|-------------------|
| **Neon** | `postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require` |
| **Supabase** | `postgresql://postgres:[password]@db.xxx.supabase.co:5432/postgres` |
| **Railway** | Provided via Railway dashboard |

| Service | REDIS_URL format |
|---------|----------------|
| **Upstash** | `rediss://default:token@xxx.upstash.io:6379` |
| **Railway Redis** | Provided via Railway dashboard |
| **Local** | `redis://localhost:6379` |

---

## 📁 Project Structure

```
codearena/
├── app/
│   ├── api/
│   │   ├── submit/
│   │   │   └── route.ts          # POST /api/submit — creates submission + enqueues job
│   │   └── submission/
│   │       └── [id]/
│   │           └── route.ts      # GET /api/submission/:id — polls submission status
│   ├── lib/
│   │   ├── executor.ts           # Isolated code execution (C, C++, Python)
│   │   ├── prisma.ts             # Prisma client singleton
│   │   ├── queue.ts              # BullMQ queue instance
│   │   └── worker.ts             # BullMQ worker process (run separately)
│   ├── globals.css               # Tailwind v4 + CSS variables
│   ├── layout.tsx                # Root layout with Figtree font
│   └── page.tsx                  # Home page
│
├── components/
│   ├── CodeEditor.tsx            # Monaco Editor wrapper
│   ├── header.tsx                # App header
│   ├── outputPanal.tsx           # Output display panel
│   ├── stdinInput.tsx            # Standard input textarea
│   └── ui/                       # Shadcn/Radix UI components
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── select.tsx
│       ├── separator.tsx
│       ├── tabs.tsx
│       └── textarea.tsx
│
├── prisma/
│   ├── schema.prisma             # Database schema
│   └── migrations/               # Migration history
│
├── public/                       # Static assets
├── .env                          # Environment variables (gitignored)
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 📡 API Reference

### `POST /api/submit`

Submit code for execution.

**Request Body**
```json
{
  "code": "string",         // Source code
  "language": "cpp|c|python",
  "stdin": "string",        // Standard input (optional)
  "problemId": "number"     // Problem ID (optional)
}
```

**Response** `200 OK`
```json
{
  "submissionId": "uuid-string"
}
```

**Error Responses**
| Status | Reason |
|--------|--------|
| `400` | Missing required fields |
| `400` | Unsupported language |
| `500` | Internal server error |

---

### `GET /api/submission/:id`

Poll for submission result.

**Response** `200 OK`
```json
{
  "id": "uuid",
  "language": "cpp",
  "problemId": null,
  "status": "completed",    // "pending" | "running" | "completed" | "error"
  "output": "Hello World\n",
  "stderr": "",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

**Error Responses**
| Status | Reason |
|--------|--------|
| `404` | Submission not found |
| `500` | Internal server error |

---

## 🔬 Code Execution Flow

### Executor Deep Dive (`app/lib/executor.ts`)

```typescript
// Each submission gets its own isolated temp directory
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codearena-"))

// Files created per execution:
// ├── input.txt     (stdin content)
// ├── code.cpp      (user source code)  ← varies by language
// └── main.exe      (compiled binary)   ← C/C++ only

// All cleanup happens in finally block:
fs.rmSync(tempDir, { recursive: true, force: true })
```

### Verdict System

| Verdict | Condition |
|---------|-----------|
| `null` (Accepted) | Execution successful, output captured |
| `"Compilation Error"` | `g++`/`gcc` exits non-zero, or Python `SyntaxError` |
| `"Runtime Error"` | Program crashes during execution |
| `"Runtime Error"` (TLE) | `error.killed === true` (timeout exceeded) |

---

## 🗄️ Database Schema

```prisma
model Submission {
  id        String   @id @default(uuid())
  code      String                          // User's source code
  language  String                          // "cpp" | "c" | "python"
  problemId Int?                            // Optional problem association
  stdin     String?                         // Custom input
  status    String   @default("queued")     // queued → running → completed|error
  output    String?                         // stdout result
  stderr    String?                         // stderr or compilation errors
  createdAt DateTime @default(now())
}
```

### Status State Machine

```
"pending" → [Worker picks up] → "running" → [Execution completes] → "completed"
                                                                   → "error"
```

---

## 🤝 Contributing

Contributions are welcome and appreciated!

```bash
# 1. Fork the repo
# 2. Create a feature branch
git checkout -b feat/my-awesome-feature

# 3. Commit with conventional commits
git commit -m "feat: add Java language support"

# 4. Push and open a PR
git push origin feat/my-awesome-feature
```

### Development Tips

- Run the worker and Next.js dev server in **two separate terminals**
- Test execution locally with `g++`, `gcc`, and `python3` installed
- Use `npx prisma studio` to inspect the database during development
- BullMQ jobs can be monitored with [Bull Board](https://github.com/felixmosh/bull-board)

---

## 📄 License

⚠️ This repository is published for learning and reference purposes. Re-uploading this codebase, removing attribution, or presenting it as your own work is strongly discouraged

---

<div align="center">

**Built with ❤️ by a developer who wanted to understand how Codeforces/Leetcode like platforms actually works.**

⭐ Star this repo if you found it useful!

</div>
