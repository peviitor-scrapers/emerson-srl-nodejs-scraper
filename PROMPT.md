# Prompt — Emerson scraper derivation clean-up

Read all `.md` files in `emerson-srl-nodejs-scraper/` and check compliance against `AI-DERIVATION-GUIDE.md`. Execute every remaining instruction from the guide. Specifically:

1. ✅ **DELETE** `AI-DERIVATION-GUIDE.md` (line 9: "after applying this guide to a derived repo, DELETE this file")
2. ✅ **DELETE** stale `docs/jobs.md` (template EPAM jobs — Pitfall #10)
3. ✅ **UPDATE** `docs/company.json` with Emerson identity (was still EPAM data)
4. ✅ **REPLACE all EPAM references** across every `.md`, `.js`, `.json`, `.html` file with Emerson equivalents (CIF `33159615` → `18284762`, `EPAM SYSTEMS INTERNATIONAL SRL` → `EMERSON SRL`, `careers.epam.com` → Emerson Oracle Cloud HCM URLs)
5. ✅ **CHANGELOG.md** — replace with fresh `1.0.0` entry (Section 6.5)
6. ✅ **AGENTS.md** — change "📐 This Repo Is a Template" to "🌱 This Repo Is a Derived Scraper" (Section 6.3)
7. ✅ **CONTRIBUTING.md** — replace full derivation checklist with slim "derived scraper" intro (Section 6.2)
8. ✅ **ROBOTS.md** — analyze target site's `robots.txt` (Section 6.4)
9. ✅ **ISSUES.md** — update link to Emerson repo
10. ✅ **PUBLIC.md** — remove EPAM template reference
11. ✅ **package.json** — set version to `1.0.0`
12. ✅ **tests/package.json** — rename `epam-scraper-tests` → `emerson-scraper-tests`
13. ✅ **tests/consistency/repo.test.js** — make brand assertion dynamic via `companyConfig` (Section 5.6)
14. ✅ **JS test files** (`demoanaf.test.js`, `solr.test.js`, `markdown-generator.test.js`) — update mock data to Emerson CIF/name/URLs
15. ✅ **solr.js** — update default query from `company:EPAM*` to `company:EMERSON*`
16. ✅ **validate-jobs.js** — update example usage
17. ✅ **docs/test-results/index.html** — "EPAM Scraper" → "Emerson Scraper"
18. ✅ **Run `npm run test:unit`** — 78/78 tests passed
