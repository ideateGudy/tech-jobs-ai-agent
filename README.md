# Tech Jobs Agent - Setup & Testing Guide

## ✅ Configuration Complete

Your jobs agent is fully configured and ready to use. Here's what was set up:

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **RSS Tool** | `src/mastra/tools/rss-tool.ts` | Fetches & parses RSS feeds, filters by keywords |
| **Jobs Agent** | `src/mastra/agents/jobs-agent.ts` | LLM agent with rssTool integrated |
| **Keyword Extractor** | `src/utils/keyword-extractor.ts` | Extracts tech keywords from queries |
| **RSS Feeds** | `src/data/rss-feeds.ts` | 4 public job feed URLs (Himalayas, Remotive, WeWorkRemotely, RemoteOK) |
| **Mastra Config** | `src/mastra/index.ts` | Registers jobsAgent + weatherAgent; includes bundler externals |

---

## 🚀 Running the Project

### Development Server

```bash
npm run dev
```

This starts the Mastra dev server at:
- **Playground**: http://localhost:4111/ (web UI for testing agents)
- **API**: http://localhost:4111/api (REST endpoints)

### Build for Production

```bash
npm run build
```

### Start Production Server

```bash
npm start
```

---

## 🧪 Testing the Jobs Agent

### Option 1: Web Playground (Recommended)

1. Run `npm run dev`
2. Open http://localhost:4111/
3. Select **`jobsAgent`** from the dropdown
4. Enter a query like:
   - "Find 5 latest Flutter jobs"
   - "Show backend developer roles"
   - "Get remote Python positions"
5. Click send and watch the agent fetch & filter results

### Option 2: curl (API Testing)

```bash
# Stream agent response for a job query
curl -X POST http://localhost:4111/api/agents/jobsAgent/stream \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Find 5 latest Flutter jobs"
      }
    ]
  }'
```

### Option 3: Node.js Test Script

```bash
# Run the included test script
node test-jobs-agent.js
```

This will test sample queries and display results.

---

## 🔍 How the Jobs Agent Works

### Flow

1. **User Query** → Agent receives query (e.g., "Find Flutter jobs")
2. **Keyword Extraction** → Extracts tech keywords (e.g., `['flutter']`)
3. **RSS Fetching** → Tool fetches from 4 feeds in parallel with 5-second timeout
4. **Feed Parsing** → Parses RSS using `@rowanmanning/feed-parser`
5. **Keyword Filtering** → Matches extracted keywords against job title + description
6. **Sorting & Limiting** → Sorts by publication date (newest first), returns up to 10 results
7. **LLM Response** → GPT-4o-mini formats results for user

### RSS Feeds Used

- https://himalayas.app/jobs/rss
- https://remotive.com/remote-jobs/feed
- https://weworkremotely.com/categories/remote-programming-jobs.rss
- https://remoteok.com/remote-dev-jobs.rss

### Keyword Filter Logic

The tool extracts keywords by:
- Converting query to lowercase
- Removing special characters
- Splitting on whitespace
- **Excluding stopwords**: "find", "show", "latest", "remote", "job", "jobs", "for", "me", "the"
- Matching remaining keywords against job title & description

**Examples:**
- "Find Flutter jobs" → keywords: `['flutter']`
- "Show backend developer roles" → keywords: `['backend', 'developer', 'roles']`
- "Get remote Python positions" → keywords: `['python', 'positions']`

---

## 📋 Agent Configuration Details

### Jobs Agent (`src/mastra/agents/jobs-agent.ts`)

```typescript
- name: 'Jobs Agent'
- model: 'openai/gpt-4o-mini'  // Requires OPENAI_API_KEY env var
- tools: { rssTool }           // Tool for fetching jobs
- memory: LibSQLStore          // Stores conversation history
- database: file:../mastra.db  // Relative to .mastra/output
```

### RSS Tool (`src/mastra/tools/rss-tool.ts`)

```typescript
Input Schema:
- query: string (e.g., "Flutter jobs")
- limit: number (default: 10, max results to return)

Output Schema:
- jobs: array of { title, link, description, pubDate, source }
- total: number (count of results)
- query: string (original query)
```

---

## 🔧 Key Implementation Details

✅ **ESM Imports**: All imports include `.js` extension (required for Mastra runtime)  
✅ **Zod Schemas**: Strict input/output validation via zod schemas  
✅ **Error Handling**: Graceful fallback if individual RSS feeds fail  
✅ **Externals**: `axios` and `@rowanmanning/feed-parser` configured in bundler  
✅ **Async Streaming**: Supports streaming agent responses  
✅ **Type Safety**: Full TypeScript support, no compilation errors

---

## 🌐 Environment Variables

### Required

```bash
OPENAI_API_KEY=sk-...  # For GPT-4o-mini model
```

### Optional

```bash
MASTRA_CLOUD_ACCESS_TOKEN=...  # For cloud tracing (optional)
```

---

## 🐛 Troubleshooting

### "Connection refused" on localhost:4111

- Ensure `npm run dev` is running
- Check no other process is using port 4111
- Try: `npm run build` first to verify no build errors

### Agent returns no results

- Verify RSS feeds are accessible (check manually)
- Ensure query contains recognizable tech keywords
- Stopwords are filtered out (check `src/utils/keyword-extractor.ts`)

### Build fails with externals error

- Ensure `bundler.externals` includes both `axios` and `@rowanmanning/feed-parser`
- Check `src/mastra/index.ts` has the correct config

---

## 📚 Example Queries to Try

```
"Find the latest React developer jobs"
"Show me remote backend roles with Node.js"
"Get 5 Python positions"
"Find DevOps engineer opportunities"
"Show remote startup jobs"
"Latest web developer remote positions"
"Find full stack developer jobs"
```

---

## 📁 Project Structure

```
tech-jobs/
├── src/
│   ├── mastra/
│   │   ├── index.ts                 # Main Mastra config
│   │   ├── agents/
│   │   │   ├── jobs-agent.ts        # Jobs agent definition
│   │   │   └── weather-agent.ts     # Weather agent (example)
│   │   ├── tools/
│   │   │   ├── rss-tool.ts          # RSS fetching & parsing tool
│   │   │   └── weather-tool.ts      # Weather tool (example)
│   │   ├── workflows/
│   │   │   └── weather-workflow.ts  # Workflow example
│   │   └── scorers/
│   │       └── weather-scorer.ts    # Scorer examples
│   ├── data/
│   │   └── rss-feeds.ts             # RSS feed URLs
│   └── utils/
│       └── keyword-extractor.ts     # Keyword extraction logic
├── package.json
├── tsconfig.json
├── test-jobs-agent.js               # API test script
└── README.md                         # This file
```

---

**Ready to test? Run `npm run dev` and open http://localhost:4111/** 🎉
