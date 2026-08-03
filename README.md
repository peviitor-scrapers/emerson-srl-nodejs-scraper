# job_seeker_ro_spider — EMERSON SRL Scraper

[![Oportunitati SI Cariere](https://github.com/peviitor-scrapers/emerson-srl-nodejs-scraper/actions/workflows/job-seeker-ro-spider.yml/badge.svg)](https://github.com/peviitor-scrapers/emerson-srl-nodejs-scraper/actions/workflows/job-seeker-ro-spider.yml)
[![Automation Tests](https://github.com/peviitor-scrapers/emerson-srl-nodejs-scraper/actions/workflows/automation-testing.yml/badge.svg)](https://github.com/peviitor-scrapers/emerson-srl-nodejs-scraper/actions/workflows/automation-testing.yml)

[![Version](https://img.shields.io/github/package-json/v/peviitor-scrapers/emerson-srl-nodejs-scraper?label=version&color=blue)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![JavaScript](https://img.shields.io/badge/javascript-ESM-F7DF1E?logo=javascript&logoColor=black)](https://ecma-international.org/)
[![Node.js](https://img.shields.io/badge/node-24-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Website](https://img.shields.io/website?url=https%3A%2F%2Fpeviitor.ro&label=peviitor.ro)](https://peviitor.ro)

**job_seeker_ro_spider** — un scraper pentru job-urile EMERSON SRL (CIF: 18284762). Extrage anunțurile din [Emerson Careers](https://hdjq.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1) (Oracle Cloud HCM API)) și le publică în [peviitor.ro](https://peviitor.ro) prin API-ul SOLR.

> **Derived from [EPAM template](https://github.com/sebiboga/epam-systems-international-srl-nodejs-scraper)** — this scraper uses the Oracle Cloud HCM JSON API for job listings.

## Overview

Proiectul automatizează colectarea zilnică a job-urilor Emerson din România, menținând board-ul peviitor.ro la zi cu cele mai recente oportunități de carieră.

## Features

- Extrage job-uri din Emerson Oracle Cloud HCM API (JSON)
- Validează compania via ANAF (CIF 18284762, status activ, adresă completă)
- Cross-validează cu Peviitor API
- Stochează în SOLR (job core + company core)
- Generează `docs/jobs.md` automat — accesibil pe GitHub Pages
- **Identitate companie într-un singur fișier** (`config/company.json`)
- GitHub Actions: scrape zilnic + testare automată (unit, integration, e2e, consistency)

## Architecture

```
scraper/config/company.json  →  Single source of truth for company identity
scraper/config/scraper.json  →  API endpoints (Oracle HCM base + path)
scraper/index.js             →  Main scraper (Oracle Cloud HCM API + ANOFM)
scraper/company.js           →  ANAF validation
scraper/api.js               →  Peviitor API (job + company cores)
scraper/anaf.js              →  ANAF API client
tests/                       →  Unit, integration, E2E, consistency tests
docs/                        →  GitHub Pages dashboard
```

## Setup

1. Clone the repo
2. Run `npm install`
3. Run `npm run scrape`

## Testing

```bash
npm run test:unit          # Unit tests
npm run test:integration   # Integration tests (needs ANAF)
npm run test:e2e           # E2E tests (needs network)
npm run test:consistency   # Consistency tests (needs GITHUB_REPOSITORY)
npm test                   # All tests
```

## Company Details

| Field | Value |
|---|---|
| CIF | 18284762 |
| Legal Name | EMERSON SRL |
| Brand | EMERSON |
| Website | https://www.emerson.com |
| Career | https://hdjq.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1 |
| Oracle HCM API | https://hdjq.fa.us2.oraclecloud.com/hcmRestApi |
| Default Location | Cluj-Napoca |

## Derived From

This scraper was derived from the [EPAM template](https://github.com/sebiboga/epam-systems-international-srl-nodejs-scraper).

## License

MIT
