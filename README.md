# CommUnity Hub

Welcome to **CommUnity Hub**, a collaborative digital platform designed to fluidly bridge the gap between NGOs, community coordinators, and on-the-ground volunteers. 

Our app provides a unified ecosystem for organizations to efficiently manage tasks (Needs), approve incoming requests, parse offline receipts digitally, and distribute digital resources effortlessly!

## 🚀 Key Features

*   **Multi-tenant Organization Workflows**: Super Admins and local Admins can run highly scoped organizations with complete tenant data isolation.
*   **Volunteer Portal**: Clean gamified dashboards for volunteers to self-assign tasks, view active jobs on a Map, mark progress, and upload on-site proofs.
*   **Smart Drive & Requests Hub**: An integrated cloud file system. Admins can upload generic guidelines to their volunteers. Volunteers can upload certifications that land cleanly in an "Approvals" tray before hitting the repository!
*   **Impact Tracking & Surveys**: Advanced interactive polling and comprehensive analytical tracking.
*   **Receipt OCR**: Powered by Google Gemini AI, simply upload a physical receipt and get perfectly parsed digital form data!

## 🛠️ Technology Stack

1.  **Frontend**: Vite + React, TailwindCSS, Shadcn UI
2.  **State Management**: React Query (w/ Orval auto-generated client schemas)
3.  **Backend**: Node.js, Express, Pino (Logging)
4.  **Database**: Postgres (Supabase Backend) hooked up with Drizzle ORM
5.  **Storage**: Supabase Storage Buckets
6.  **Architecture**: PNPM Monorepo 

## 📦 Getting Started

To set up the project locally, follow these steps:

### 1. Environment Configuration

Copy the `.env.example` file to a new file named `.env` at the project root:

```bash
cp .env.example .env
```

Open the `.env` file and fill in your actual credentials (database URL, session secrets, OCR keys, etc.).

### 2. Install Dependencies

Ensure you have [pnpm](https://pnpm.io/) installed globally, then run:

```bash
pnpm install
```

### 3. Database Migrations

Ensure your database is cleanly hooked up, then push the database schema to your Supabase instance:

```bash
pnpm --filter "@workspace/db" run push
```

### 4. Start Development Server

Run the full application in development mode natively:

```bash
# Start both api-server (Port 3000) and community-hub web app (Port 5173) parallelly!
pnpm run dev
```

## 🔒 Security Note

This repository fiercely advocates environment variables for all sensitive configuration. **Never commit your `.env` file.** If you introduce a system integration requiring a key, consistently update `.env.example` with a dummy placeholder.
