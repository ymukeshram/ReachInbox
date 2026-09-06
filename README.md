# ReachInbox — Full-stack Email Job Scheduler & Inbox Dashboard

**Live Demo:** [https://reachinbox-alok.onrender.com](https://reachinbox-alok.onrender.com)

A production-grade, full-stack email job scheduler service and 3-column inbox dashboard built for **ReachInbox.ai** (Outbox Labs). 

This application reliably schedules, throttles, persists, and sends emails at scale using **BullMQ**, **Redis**, **PostgreSQL**, **Elasticsearch**, **Express.js**, and **React**.

---

## 🚀 Live Deployment

The application is deployed on Render and accessible at:
👉 **[https://reachinbox-alok.onrender.com](https://reachinbox-alok.onrender.com)**

- **Frontend Dashboard**: `https://reachinbox-alok.onrender.com/dashboard`
- **Backend API Health Check**: `https://reachinbox-alok.onrender.com/health`
- **Live BullMQ Queue Dashboard**: `https://reachinbox-alok.onrender.com/admin/queues`

---

## 💻 1. How to Run Locally

### Prerequisites
- Node.js (v18+)
- Docker & Docker Compose (for PostgreSQL, Redis, and Elasticsearch)

### Quick Start
The entire system can be launched using a single command:

```bash
# 1. Install workspace dependencies
npm install

# 2. Start PostgreSQL, Redis, Elasticsearch, apply DB migrations, and launch Frontend & Backend
npm run dev:local
```

### Access Points (Local)
- **Frontend Dashboard**: [http://127.0.0.1:3000/dashboard](http://127.0.0.1:3000/dashboard)
- **Backend API Server**: [http://localhost:3001/health](http://localhost:3001/health)
- **Live BullMQ Dashboard**: [http://localhost:3001/admin/queues](http://localhost:3001/admin/queues)

---

## 📧 2. Ethereal Email Setup & Environment Variables

### Ethereal Email (Fake SMTP)
In development, ReachInbox automatically creates an **Ethereal Email** sandbox account if custom SMTP credentials are not specified.

- Preview links to sent emails are logged directly to the backend terminal:
  ```text
  [INFO] Ethereal email sent preview: https://ethereal.email/message/Yx...
  ```

---

## 🏗️ 3. Architecture Overview

```
 ┌────────────────┐       ┌─────────────────┐       ┌──────────────────┐
 │ React Frontend │ ────> │ Express API     │ ────> │ PostgreSQL DB    │
 │ (Dashboard UI) │ <──── │ Server          │       │ (State & Users)  │
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

## 🎯 4. Features Implemented Matrix

### ⚙️ Backend Features
- ✅ **API Scheduler**: `POST /api/emails/schedule` handles batch & individual email scheduling.
- ✅ **BullMQ + Redis Engine**: Persistent job queue with configurable concurrency, retry backoffs, and stalled job recovery.
- ✅ **Elasticsearch Log Indexing**: Real-time indexing of all sent and failed email payloads into Elasticsearch (`email_logs`).
- ✅ **Bull Board UI**: Exposes live queue metrics, active workers, delayed jobs, and failed tasks at `/admin/queues`.
- ✅ **Slack OAuth & Webhooks**: Supports real Slack OAuth authorization (`/api/slack/connect`) and rate-limit alert dispatching.
- ✅ **Non-Fatal Database Initialization**: Graceful fallbacks for local database startup and offline development.

### 🎨 Frontend Features
- ✅ **Google OAuth**: Full Google OAuth flow implementation for secure user authentication.
- ✅ **3-Column Inbox Dashboard**: Replicates Figma specification with `Scheduled Emails` and `Sent Emails` view filters.
- ✅ **User Profile Header**: Displays logged-in user name, email address, avatar, and Logout button.
- ✅ **Compose Modal**:
  - Rich HTML text formatting toolbar.
  - CSV/XLSX recipient list parser displaying total recipient count.
  - Throttling settings: **Start Time**, **Delay Between Emails**, and **Hourly Limit**.
- ✅ **Interactive Action Toolbar**:
  - ⭐ **Star Button**: Pins starred emails to the top of the list view with a gold icon.
  - 🗑️ **Delete Button**: Permanently deletes selected emails from view.
  - 📦 **Archive Button**: Archives emails from main workspace.
  - 🔍 **Search & Filter**: Real-time subject/recipient search with sorting capabilities.

---

## 📄 License
This project is created for the ReachInbox Software Development Assignment.
