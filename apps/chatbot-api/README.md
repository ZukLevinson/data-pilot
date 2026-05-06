# Chatbot API (Backend)

The **Chatbot API** provides the intelligence and data storage for the Data Pilot project.

## 🚀 Features
- **NestJS Framework**: Modular and scalable backend architecture.
- **Prisma ORM**: Type-safe database access to PostgreSQL.
- **PostGIS Support**: Handling spatial data for maps.
- **LangChain & OpenAI**: Powering the natural language interface.

## 🛠️ Development
Run `npx nx serve chatbot-api` for a dev server.

## 🗄️ Database
Ensure you have a PostgreSQL database with PostGIS enabled.
Run `npx prisma migrate dev` to apply migrations.
Run `npx nx reseed-geo chatbot-api` to seed the database with spatial data.

## 📦 Build
Run `npx nx build chatbot-api` to build the project.
For production, use the root `Dockerfile` to deploy to Cloud Run.
