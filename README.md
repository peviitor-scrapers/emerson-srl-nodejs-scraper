# job_seeker_ro_spider — Emerson (EMERSON SRL) Romania Scraper

[![Oportunitati SI Cariere](https://github.com/sebiboga/emerson-srl-nodejs-scraper/actions/workflows/job-seeker-ro-spider.yml/badge.svg)](https://github.com/sebiboga/emerson-srl-nodejs-scraper/actions/workflows/job-seeker-ro-spider.yml)
[![Automation Tests](https://github.com/sebiboga/emerson-srl-nodejs-scraper/actions/workflows/automation-testing.yml/badge.svg)](https://github.com/sebiboga/emerson-srl-nodejs-scraper/actions/workflows/automation-testing.yml)

[![Version](https://img.shields.io/github/package-json/v/sebiboga/emerson-srl-nodejs-scraper?label=version&color=blue)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![JavaScript](https://img.shields.io/badge/javascript-ESM-F7DF1E?logo=javascript&logoColor=black)](https://ecma-international.org/)
[![Node.js](https://img.shields.io/badge/node-24-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![GitHub Pages](https://img.shields.io/github/deployments/sebiboga/emerson-srl-nodejs-scraper/github-pages?label=GitHub%20Pages)](https://sebiboga.github.io/emerson-srl-nodejs-scraper/)

**job_seeker_ro_spider** — un scraper pentru job-urile Emerson (EMERSON SRL) din România. Extrage anunțurile din Oracle Cloud HCM API și le publică în [peviitor.ro](https://peviitor.ro) prin API-ul SOLR.

> **Derivat din template:** Acest scraper este derivat din [epam-systems-international-srl-nodejs-scraper](https://github.com/sebiboga/epam-systems-international-srl-nodejs-scraper).

## Features

- Extrage job-uri din Oracle Cloud HCM API
- Autentificare API cu `Ora-Irc-Cx-UserId` header
- Validează compania via ANAF (CUI, status activ/inactiv)
- Cache ANAF la 7 zile — committed în repo
- Fallback la cache stale dacă ANAF e indisponibil
- Cross-validează cu Peviitor API
- Stochează în SOLR (job core + company core)
- Generează `docs/jobs.md` automat
- Identitate companie într-un singur fișier (`config/company.json`)
- GitHub Actions: scrape zilnic + testare automată
- Se identifică prin User-Agent: `job_seeker_ro_spider`

## Project Structure

```
├── index.js                    # Main scraper entry point
├── company.js                  # Company validation via ANAF + Peviitor + SOLR
├── solr.js                     # SOLR operations
├── config/
│   ├── company.json            # Single source of truth: CIF, brand, URLs, API params
│   └── company.js              # ESM loader for company.json
├── src/
│   ├── anaf.js                 # ANAF API core module
│   ├── markdown-generator.js   # Generates docs/jobs.md
│   └── job-validator.js        # Shared validateByHead + validateByContent
├── company.json                # ANAF data cache (committed, 7-day TTL)
├── tests/
│   ├── unit/                   # Unit tests (mock everything)
│   ├── integration/            # Integration tests (ANAF public API)
│   ├── e2e/                    # End-to-end tests (real API)
│   └── consistency/            # Repo config verification
└── .github/workflows/          # CI/CD automation
```

## Quick Start

```bash
npm install
echo "SOLR_AUTH=your-solr-credentials" > .env.local
npm test                # Run all tests
npm run test:unit       # Unit tests only
```

## Company Info

| Field | Value |
|-------|-------|
| Company | EMERSON SRL |
| Brand | Emerson |
| CIF/CUI | 18284762 |
| Website | emerson.com |
| Status | Activ |

## Acknowledgments

This project was developed with assistance from AI tools and derived from the [EPAM template](https://github.com/sebiboga/epam-systems-international-srl-nodejs-scraper).

## License

Copyright (c) 2024-2026 BOGA SEBASTIAN-NICOLAE
Licensed under the [MIT License](LICENSE).

## Managed By

This project is managed by [ASOCIATIA OPORTUNITATI SI CARIERE](https://oportunitatisicariere.ro) and used as a web scraper for the [peviitor.ro](https://peviitor.ro) job board project.
