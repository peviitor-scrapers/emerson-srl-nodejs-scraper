# AGENTS.md — Rules for AI agents

## Project
Emerson SRL scraper for peviitor.ro (Node.js, ESM, Jest)

## This Repo Is a Derived Scraper
This repo is a **derived scraper** for EMERSON SRL (CIF: 18284762), scraped from the Emerson Oracle Cloud HCM Careers API. It was derived from the [EPAM template](https://github.com/sebiboga/epam-systems-international-srl-nodejs-scraper).

## 📐 Template Alignment
This repo follows the EPAM template structure:
- **All company-specific identity lives in `scraper/config/company.json`** (id, company, brand, status, location[], website[], career[], scraperFile). Read from `scraper/config/company.js` in Node code, or via `jq` in workflows. Never hardcode in source files.
- **Only the API parsing logic in `scraper/index.js`** (`fetchJobsPage`, `parseApiJobs`) is Emerson-specific (Oracle Cloud HCM API). The output shape (`mapToJobModel`, `transformJobsForSOLR`) must stay uniform across derived scrapers.
- **All Solr operations go through the Peviitor API** via `scraper/api.js` — no direct SOLR access, no `SOLR_AUTH` needed.

## Critical Rules

### 0. Background tasks — always pass `--repo` explicitly to `gh`

When polling a workflow run, the `gh run view` command implicitly uses the current working directory's git remote. If the CWD is a different repo, `gh` looks in the wrong repo.

**Always specify the repo explicitly:**
```bash
gh run view <RUN_ID> --repo peviitor-scrapers/emerson-srl-nodejs-scraper --json status -q .status
```

### 1. Temporary Files
All temporary/scratch files MUST go in `tmp/` inside the project root.
NEVER use paths outside the project.

### 2. Issues & GitHub
- **Orice modificare de cod trebuie să aibă un issue în GitHub Issues** (vezi [ISSUES.md](ISSUES.md))
- Excepții: typo-uri, whitespace, documentație minoră
- Create a GitHub issue before implementing any change
- Commit messages must reference the issue they close
- Never commit credentials (`.env.local`, `*.pem`, etc.)
- Push after commit

### 3. Environment Variables
- `.env.local` is NOT used — all operations go through the Peviitor API (no direct SOLR access)
- Consistency tests need `GITHUB_REPOSITORY` (format: `owner/repo`) and `GITHUB_TOKEN`

### 4. Testing
```bash
npm run test:unit
npm run test:integration   # needs ANAF
npm run test:e2e           # needs ANAF
npm run test:consistency   # needs GITHUB_REPOSITORY + GITHUB_TOKEN
```

### 5. Commit & Push
- `git add -A && git commit -m "..." && git push`
- Commit messages must reference the related issue
- Never `--force` push

### 6. DO NOT modify these files (derived from template)
- `scraper/anaf.js`
- `scraper/company.js`
- `scraper/job-validator.js`
- `scraper/validate-jobs.js`

### 7. Maintenance Agent
See [MAINTENANCE.md](MAINTENANCE.md) for the full maintenance workflow.

**On every session:**
1. Check open GitHub issues: `gh issue list --repo peviitor-scrapers/emerson-srl-nodejs-scraper --state open`
2. Prioritize: `critical` → `bug` → `enhancement` → `documentation`
3. Fix all issues, commit with `#issue` reference, close the issue
