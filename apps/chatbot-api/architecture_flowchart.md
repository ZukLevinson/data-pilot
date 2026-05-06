# GIS Chatbot Architecture & Workflow

This diagram represents the high-level architecture and the internal logical flow of the Data Pilot GIS Assistant.

```mermaid
graph TD
    subgraph "Frontend (Portal - Angular)"
        UI[User Input] --> CS_F["ChatService.sendMessage()"]
        CS_F --> SSE["SSE Connection (/api/chat/stream)"]
        SSE --> UI_UP["Update UI: Map + Table + Chat Summaries"]
        UI_UP --> SYNC["Dual-Pane Sync (Zoom to Entity)"]
    end

    subgraph "Backend (chatbot-api - NestJS)"
        SSE --> CS_B["ChatService.processChatStream()"]
        
        subgraph "1. Planning Phase (ChatPlanner)"
            CS_B --> IDT["identifyTarget (LLM)"]
            IDT --> GEN["generatePlan (LLM)"]
            GEN --> INF["Field Inference & Relational Mapping"]
            INF --> PLAN["Structured QueryPlan JSON"]
        end

        subgraph "2. Execution Phase (ChatExecutor)"
            PLAN --> EXE["executePlan()"]
            EXE --> MAP["mapConditionsToPrisma (Recursive)"]
            
            subgraph "Parallel Data Retrieval"
                MAP --> ENT["Fetch Entities (Prisma findMany)"]
                ENT --> HYD["WKT Hydration (PostGIS ST_AsText)"]
                MAP --> AGG["Aggregations & GroupBy (Prisma aggregate)"]
                AGG --> RES["ID-to-Name Resolution"]
            end
        end

        subgraph "3. Intelligence & Response"
            HYD --> CHK["ChatStreamChunk (Sources)"]
            RES --> CHK["ChatStreamChunk (QueryPlan)"]
            CHK --> LLM["LLM Final Answer Contextualization"]
            LLM --> SSE
        end
    end

    subgraph "Database Layer"
        ENT --> DB[(PostgreSQL + PostGIS)]
        AGG --> DB
    end
```

## Key Workflow Details

### 1. Intelligent Field Inference
When a user asks for a field not present on the target entity (e.g., "Mines of type Neodymium"), the **Planner** automatically:
- Identifies the correct target (`Mine`).
- Infers the relation holding the field (`Cluster`).
- Generates a recursive `RelationFilter` to bridge the gap.

### 2. Analytical Engine
For queries involving statistics (e.g., "Top 10 mines by quantity"), the **Executor**:
- Performs `groupBy` and `orderBy` calculations directly in the database.
- Resolves technical UUIDs into human-readable names for UI presentation.
- Sets the `isStatsOnly` flag to prioritize analytical summaries over geographic markers when appropriate.

### 3. Dual-Batch Hydration
To maintain high UI responsiveness:
- **Batch 1**: Returns lightweight names and IDs immediately.
- **Batch 2**: Returns heavy spatial (WKT) data for map visualization once available.
