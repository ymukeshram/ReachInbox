# ReachInbox — Full-stack Email Job Scheduler & Inbox Dashboard

A production-grade, full-stack email job scheduler service and 3-column inbox dashboard built for **ReachInbox.ai** (Outbox Labs). 

This application reliably schedules, throttles, persists, and sends emails at scale using **BullMQ**, **Redis**, **PostgreSQL**, **Elasticsearch**, **Express.js**, and **React**.

---

## 🚀 Quick Start (Local Development)

The entire system (PostgreSQL, Redis, Elasticsearch, Prisma migrations, Backend, and Frontend) can be launched using a single command:

```bash
# 1. Install workspace dependencies
npm install

# 2. Start PostgreSQL, Redis, Elasticsearch, apply DB migrations, and launch Frontend & Backend
npm run dev:local
```

### Access Points
- **Frontend Dashboard**: [http://127.0.0.1:3000/dashboard](http://127.0.0.1:3000/dashboard)
- **Backend API Server**: [http://localhost:3001/health](http://localhost:3001/health)
- **Live BullMQ Dashboard**: [http://localhost:3001/admin/queues](http://localhost:3001/admin/queues)

---

## 💻 1. How to Run Backend

### Prerequisites
- Node.js (v18+)
- Docker & Docker Compose (for PostgreSQL, Redis, and Elasticsearch)

### Manual Backend Setup
If running services manually without `npm run dev:local`:

1. Start infrastructure containers:
   ```bash
   docker compose up -d
   ```

2. Navigate to `backend` directory & install dependencies:
   ```bash
   cd backend
   npm install
   ```

3. Ensure environment variables are loaded (`backend/.env`):
   ```env
   PORT=3001
   DATABASE_URL=postgresql://reachinbox:reachinbox@localhost:5432/reachinbox?schema=public
   REDIS_HOST=localhost
   REDIS_PORT=6379
   WORKER_CONCURRENCY=5
   MAX_EMAILS_PER_HOUR_PER_SENDER=200
   MIN_DELAY_BETWEEN_EMAILS_MS=2000
   ```

4. Apply database migrations:
   ```bash
   cd ..
   npm run db:deploy
   ```

5. Run the backend development server (starts Express API & BullMQ worker):
   ```bash
   npm --prefix backend run dev
   ```

---

## 🎨 2. How to Run Frontend

1. Navigate to `frontend` directory & install dependencies:
   ```bash
   cd frontend
   npm install
   ```

2. Configure environment variables (`frontend/.env`):
   ```env
   VITE_API_URL=http://localhost:3001
   VITE_DEV_AUTH_BYPASS=true
   ```

3. Launch the Vite dev server:
   ```bash
   npm run dev -- --host 127.0.0.1 --port 3000
   ```

---

## 📧 3. Ethereal Email Setup & Environment Variables

### Ethereal Email (Fake SMTP)
In development, ReachInbox automatically creates an **Ethereal Email** sandbox account if custom SMTP credentials are not specified.

- Preview links to sent emails are logged directly to the backend terminal:
  ```text
  [INFO] Ethereal email sent preview: https://ethereal.email/message/Yx...
  ```
- **Optional Custom SMTP Setup** (`backend/.env`):
  ```env
  SMTP_HOST=smtp.ethereal.email
  SMTP_PORT=587
  SMTP_USER=your_ethereal_user@ethereal.email
  SMTP_PASS=your_ethereal_password
  SMTP_FROM_NAME=ReachInbox
  SMTP_FROM_EMAIL=reachinbox@ethereal.email
  ```

---

## 🏗️ 4. Architecture Overview

```
 ┌────────────────┐       ┌─────────────────┐       ┌──────────────────┐
 │ React Frontend │ ────> │ Express API     │ ────> │ PostgreSQL DB    │
 │ (Dashboard UI) │ <──── │ Server (3001)   │       │ (State & Users)  │
 └────────────────┘       └────────┬────────┘       └──────────────────┘
                                   │
                                   ▼
                          ┌──────────────────┐      ┌──────────────────┐
                          │ BullMQ Worker    │ ───> │ Redis Storage    │
                          │ (Concurrency 5)  │ <─── │ (Delayed Jobs)   │
                          └────────┬─────────┘      └──────────────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                ▼                  ▼                  ▼
     ┌──────────────────┐ ┌──────────────────┐ ┌───────────────┐
     │ Ethereal SMTP    │ │ Elasticsearch    │ │ Slack Webhook │
     │ (Email Delivery) │ │ (Search Index)   │ │ (Alerts)      │
     └──────────────────┘ └──────────────────┘ └───────────────┘
```

### 🔁 How Scheduling Works (No Cron Jobs)
- **Zero Cron Jobs**: The system strictly avoids `node-cron`, `agenda`, or OS `crontab`.
- **BullMQ Delayed Queue**: When a user schedules an email, the backend calculates delay in milliseconds (`delay = scheduledAt - Date.now()`) and pushes the payload directly into BullMQ's delay set using `emailQueue.add('send-email', data, { delay })`.
- **Exact Execution**: Redis maintains a sorted set (ZSET) ordered by timestamp. BullMQ automatically promotes jobs to active status the millisecond their delay expires.

### 💾 How Persistence on Restart is Handled
- **Dual-Layer Persistence**: All scheduled jobs are atomically stored in both **PostgreSQL** (`emails` table) and **Redis** (BullMQ AOF persistent store).
- **Restart Recovery**: If the node server crashes or restarts, BullMQ reads the delayed job state directly from Redis storage upon boot. Any jobs scheduled for the future retain their exact execution timestamp.
- **Idempotency Guard**: Before executing an email dispatch, the worker executes a status check (`SELECT status FROM emails WHERE id=$1`). If an email is already marked `sent`, the job is skipped to prevent duplicate emails.

### ⚙️ How Rate Limiting & Concurrency are Implemented
- **Worker Concurrency**: Workers process jobs concurrently via `Worker('email-queue', handler, { concurrency: 5 })`.
- **Minimum Provider Delay**: Standard delay throttling (`MIN_DELAY_BETWEEN_EMAILS_MS=2000`) is enforced between individual dispatches to mimic email service provider throttling.
- **Atomic Sliding Window Rate Limiting**: Hourly sender rate limits (`MAX_EMAILS_PER_HOUR_PER_SENDER=200`) are tracked using a Redis sorted set (`rate:sliding:${userId}`) executed via an atomic Lua script:
  - If a sender reaches their hourly limit, the job is **not dropped**.
  - Instead, the worker calculates the time remaining in the current hour window and reschedules the job for the next hour window (`delay: nextHour - Date.now()`).
- **Slack Notification on Limit**: When a rate limit is triggered, `sendRateLimitAlert()` sends a live notification to the connected Slack channel.

---

## 🎯 5. Features Implemented Matrix

### ⚙️ Backend Features
- ✅ **API Scheduler**: `POST /api/emails/schedule` handles batch & individual email scheduling.
- ✅ **BullMQ + Redis Engine**: Persistent job queue with configurable concurrency, retry backoffs, and stalled job recovery.
- ✅ **Elasticsearch Log Indexing**: Real-time indexing of all sent and failed email payloads into Elasticsearch (`email_logs`).
- ✅ **Bull Board UI**: Exposes live queue metrics, active workers, delayed jobs, and failed tasks at `/admin/queues`.
- ✅ **Slack OAuth & Webhooks**: Supports real Slack OAuth authorization (`/api/slack/connect`) and rate-limit alert dispatching.
- ✅ **Non-Fatal Database Initialization**: Graceful fallbacks for local database startup and offline development.

### 🎨 Frontend Features
- ✅ **Google OAuth & Dev Bypass**: Login page with Google OAuth redirect and instant local dev bypass toggle.
- ✅ **3-Column Inbox Dashboard**: Replicates Figma specification with `Scheduled Emails` and `Sent Emails` view filters.
- ✅ **User Profile Header**: Displays logged-in user name, email address, avatar, and Logout button.
- ✅ **Compose Modal**:
  - Rich HTML text formatting toolbar.
  - CSV/XLSX recipient list parser displaying total recipient count.
  - Throttling settings: **Start Time**, **Delay Between Emails**, and **Hourly Limit**.
- ✅ **Interactive Action Toolbar**:
  - ⭐ **Star Button**: Pins starred emails to the top of the list view with a gold icon (`#f59e0b`).
  - 🗑️ **Delete Button**: Permanently deletes selected emails from view.
  - 📦 **Archive Button**: Archives emails from main workspace.
  - 🔍 **Search & Filter**: Real-time subject/recipient search with clear button (`✕`) and sorting dropdown (`All`, `Starred Only`, `Newest First`, `Oldest First`).

---

## 🧪 Submission Video Walkthrough Guide

When creating the 5-minute demo video:
1. **Show Dashboard**: Open `http://127.0.0.1:3000/dashboard` and highlight the 3-column layout, user profile header, and tabs.
2. **Schedule Emails**: Click **Compose New Email**, attach a recipient `.csv` file, configure throttling delays, and click **Schedule**.
3. **Show Server Restart**: Stop the backend process in terminal (`Ctrl + C`), restart it, and show that scheduled emails still execute at the exact scheduled time without loss or duplicates.
4. **Show Live BullMQ Queue**: Open `http://localhost:3001/admin/queues` to display live queue jobs and metrics.

---

## 📄 License
This project is created for the ReachInbox Software Development Internship Assignment.
