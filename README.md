# Data Pilot: Nx Angular & NestJS Monorepo

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

✨ A repository for the **Data Pilot** project, showcasing a modern Angular frontend and NestJS backend in an Nx monorepo. ✨

## 📦 Project Overview

This repository contains:

- **2 Applications**
  - `portal` - Angular frontend for data visualization and chat interaction.
  - `chatbot-api` - NestJS backend serving the chatbot logic and data.

- **2 Libraries**
  - `@org/shared-ui` - Shared UI components (PrimeNG based).
  - `@org/models` - Shared data models and types.

- **E2E Testing**
  - `chatbot-api-e2e` - Tests for the backend API.

## 🚀 Quick Start

```bash
# Clone the repository
git clone <your-repo-url>
cd data-pilot

# Install dependencies
pnpm install

# Serve the frontend and backend simultaneously
npx nx run-many -t serve --projects=portal,chatbot-api

# Build all projects
npx nx run-many -t build
```

## ☁️ Hosting on Google Cloud

This project is configured for deployment on **Google Cloud Platform (GCP)**.

- **Backend**: Containerized with the root `Dockerfile` and deployed to **Cloud Run**.
- **Frontend**: Deployed to **Firebase Hosting**.
- **Database**: **Cloud SQL** (PostgreSQL with PostGIS).

Refer to the [Hosting Plan](./hosting_plan.md) for detailed deployment instructions.

## 🛠️ Key Technologies

- **Frontend**: Angular 18+, PrimeNG, Leaflet (Maps), RxJS.
- **Backend**: NestJS, Prisma ORM, LangChain (OpenAI), PostGIS.
- **Build Tooling**: Nx (Caching, Task Orchestration).

## 📁 Project Structure

```
├── apps/
│   ├── portal/           - Angular frontend app
│   └── chatbot-api/      - NestJS backend app
├── libs/
│   ├── shared-ui/        - Reusable UI components
│   └── models/           - Shared TypeScript interfaces
├── Dockerfile            - Production container for the backend
├── hosting_plan.md       - Detailed GCP deployment guide
└── nx.json               - Nx workspace configuration
```

## 📚 Useful Commands

```bash
# Development
npx nx serve portal          # Serve Angular app
npx nx serve chatbot-api     # Serve NestJS app

# Testing & Linting
npx nx test portal           # Run unit tests
npx nx lint portal           # Run ESLint
npx nx e2e chatbot-api-e2e   # Run E2E tests

# Database
npx nx reseed-geo chatbot-api # Seed spatial data
```

---

[Learn more about Nx →](https://nx.dev)
