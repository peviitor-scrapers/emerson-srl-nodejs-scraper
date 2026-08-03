import { jest } from '@jest/globals';
import fetch from 'node-fetch';
import scraperConfig from '../../scraper/config/scraper.js';

let HAS_ANAF = false;

async function checkAnafAvailability() {
  try {
    const res = await fetch('https://demoanaf.ro/api/search?q=test', {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000)
    });
    return res.ok;
  } catch {
    return false;
  }
}

function itIfAnaf(name, fn, timeout) {
  if (HAS_ANAF) {
    return it(name, fn, timeout);
  }
  return it.skip(`${name} (skipped: ANAF API unavailable)`, fn, timeout);
}

beforeAll(async () => {
  HAS_ANAF = await checkAnafAvailability();
});

const TEST_CIF = '18284762';
const TEST_BRAND = 'Emerson';
const ORACLE_BASE = scraperConfig.apiBase;
const ORACLE_API_PATH = scraperConfig.apiPath;
const CAREERS_PATH = scraperConfig.careersPath;
const ROMANIA_LOCATION_ID = scraperConfig.romaniaLocationId;
const CX_USER_ID = scraperConfig.cxUserId;
const SITE_NUMBER = scraperConfig.siteNumber;

function buildOracleUrl(limit, offset) {
  const facets = encodeURIComponent("LOCATIONS;WORK_LOCATIONS;TITLES;CATEGORIES;ORGANIZATIONS;POSTING_DATES;FLEX_FIELDS");
  const finder = `findReqs;siteNumber=${SITE_NUMBER},facetsList=${facets},limit=${limit},locationId=${ROMANIA_LOCATION_ID},sortBy=POSTING_DATES_DESC` +
    (offset ? `,offset=${offset}` : "");
  const params = new URLSearchParams({
    onlyData: "true",
    expand: "requisitionList.secondaryLocations,flexFieldsFacet.values",
    finder
  });
  return `${ORACLE_BASE}${ORACLE_API_PATH}?${params}`;
}

function getOracleHeaders() {
  return {
    Accept: "*/*",
    "Accept-Language": "en",
    "Content-Type": "application/vnd.oracle.adf.resourceitem+json;charset=utf-8",
    "Ora-Irc-Cx-UserId": CX_USER_ID,
    "Ora-Irc-Language": "en",
    Referer: `${ORACLE_BASE}${CAREERS_PATH}/requisitions?location=Romania&locationId=${ROMANIA_LOCATION_ID}&locationLevel=country&mode=location`,
    "User-Agent": "job_seeker_ro_spider",
    "sec-ch-ua": '"Not?A_Brand";v="8", "Chromium";v="108", "Google Chrome";v="108"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"'
  };
}

async function fetchOraclePage(limit, offset) {
  const res = await fetch(buildOracleUrl(limit, offset), { headers: getOracleHeaders() });
  return res.json();
}

describe('E2E: Full Scraping Pipeline', () => {

  describe('Emerson Oracle Cloud HCM API — Real Data Fetch', () => {
    let apiData;

    beforeAll(async () => {
      apiData = await fetchOraclePage(5, 0);
    }, 15000);

    it('should respond with valid job data from Oracle API', () => {
      expect(apiData).toHaveProperty('items');
      expect(Array.isArray(apiData.items)).toBe(true);
      expect(apiData.items.length).toBeGreaterThanOrEqual(1);
    }, 10000);

    it('should have TotalJobsCount and requisitionList', () => {
      const item = apiData.items[0];
      expect(item).toHaveProperty('TotalJobsCount');
      expect(typeof item.TotalJobsCount).toBe('number');
      expect(item).toHaveProperty('requisitionList');
      expect(Array.isArray(item.requisitionList)).toBe(true);
    });

    it('should have jobs with expected fields', () => {
      const item = apiData.items[0];
      if (item.requisitionList.length === 0) {
        console.log('No jobs currently available on Emerson Oracle — skipping field assertions');
        return;
      }
      const job = item.requisitionList[0];
      expect(job).toHaveProperty('Title');
      expect(typeof job.Title).toBe('string');
      expect(job).toHaveProperty('Id');
    });
  });

  describe('Parse + Transform Pipeline', () => {
    let index;
    let apiData;

    beforeAll(async () => {
      index = await import('../../scraper/index.js');
      apiData = await fetchOraclePage(5, 0);
    }, 15000);

    it('should parse real Oracle API response into standardized format', () => {
      const result = index.parseApiJobs(apiData);

      expect(result).toHaveProperty('jobs');
      expect(result).toHaveProperty('total');
      expect(result.jobs.length).toBeLessThanOrEqual(5);

      if (result.jobs.length > 0) {
        const parsed = result.jobs[0];
        expect(parsed).toHaveProperty('url');
        expect(parsed.url).toMatch(new RegExp(`^${ORACLE_BASE.replace(/\./g, '\\.')}/`));
        expect(parsed).toHaveProperty('title');
        expect(parsed).toHaveProperty('workmode');
        expect(parsed).toHaveProperty('location');
        expect(Array.isArray(parsed.location)).toBe(true);
      }
    });

    it('should map parsed jobs to job model', () => {
      const parsed = index.parseApiJobs(apiData);
      if (parsed.jobs.length === 0) {
        console.log('No jobs to map — skipping');
        return;
      }
      const model = index.mapToJobModel(parsed.jobs[0], TEST_CIF);

      expect(model).toHaveProperty('url');
      expect(model).toHaveProperty('title');
      expect(model).toHaveProperty('company');
      expect(model).toHaveProperty('cif', TEST_CIF);
      expect(model).toHaveProperty('status', 'scraped');
      expect(model).toHaveProperty('date');
    });

    it('should transform jobs and filter to Romanian locations', () => {
      const parsed = index.parseApiJobs(apiData);
      const jobs = parsed.jobs.map(j => index.mapToJobModel(j, TEST_CIF));

      const payload = {
        source: 'emerson.com',
        company: 'EMERSON SRL',
        cif: TEST_CIF,
        jobs
      };

      const transformed = index.transformJobsForSOLR(payload);

      expect(transformed.company).toBe('EMERSON SRL');
      expect(transformed.jobs.length).toBe(jobs.length);

      for (const job of transformed.jobs) {
        expect(job).toHaveProperty('location');
        expect(Array.isArray(job.location)).toBe(true);
        expect(job.location.length).toBeGreaterThan(0);
      }
    });

    it('should produce valid job URLs that are accessible', async () => {
      const parsed = index.parseApiJobs(apiData);
      if (parsed.jobs.length === 0) {
        console.log('No jobs to verify URL — skipping');
        return;
      }

      for (const job of parsed.jobs.slice(0, 2)) {
        const res = await fetch(job.url, {
          method: 'HEAD',
          headers: { 'User-Agent': 'job_seeker_ro_spider' }
        });
        expect(res.ok).toBe(true);
      }
    }, 30000);
  });

  describe('Company Validation Path', () => {
    let anaf;
    let company;

    beforeAll(async () => {
      anaf = await import('../../scraper/anaf.js');
      company = await import('../../scraper/company.js');
    });

    itIfAnaf('should find Emerson in ANAF and validate active status', async () => {
      const results = await anaf.searchCompany(TEST_BRAND);

      const emerson = results.find(c =>
        c.name.toUpperCase().startsWith('EMERSON') &&
        c.statusLabel === 'Funcțiune'
      );
      expect(emerson).toBeDefined();
      expect(emerson.cui.toString()).toBe(TEST_CIF);

      const anafData = await anaf.getCompanyFromANAF(TEST_CIF);
      expect(anafData).toBeDefined();
      expect(anafData.inactive).toBe(false);
    }, 30000);

    it('should run full validation and report active status with job count', async () => {
      const result = await company.validateAndGetCompany();

      expect(result.status).toBe('active');
      expect(result.company).toBe('EMERSON SRL');
      expect(result.cif).toBe(TEST_CIF);

      if (result.existingJobsCount === 0) {
        console.log('No Emerson jobs in Solr — skipping job count assertion');
        return;
      }
      expect(result.existingJobsCount).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Inactive Company Handling', () => {
    let anaf;

    beforeAll(async () => {
      anaf = await import('../../scraper/anaf.js');
    });

    itIfAnaf('should detect inactive/radiated companies via ANAF', async () => {
      const results = await anaf.searchCompany('EMERSON');

      const nonActive = results.find(c => c.statusLabel !== 'Funcțiune');

      if (nonActive) {
        try {
          const anafData = await anaf.getCompanyFromANAF(nonActive.cui.toString());
          expect(anafData).toBeDefined();
          if (anafData.inactive !== undefined) {
            expect(anafData.inactive).toBe(true);
          }
        } catch {
          expect(nonActive.statusLabel).toMatch(/Radiată|Inactiv|Suspendat/);
        }
      }
    }, 30000);
  });

  describe('Peviitor API Data Verification', () => {
    let api;

    beforeAll(async () => {
      api = await import('../../scraper/api.js');
    });

    it('should have Emerson jobs in SOLR with correct company name', async () => {
      const result = await api.querySOLR(TEST_CIF);

      if (result.numFound === 0) {
        console.log('No Emerson jobs in Solr — skipping SOLR data verification');
        return;
      }

      for (const job of result.docs) {
        expect(job.company).toBe('EMERSON SRL');
        expect(job.cif).toBe(TEST_CIF);
      }
    }, 15000);
  });
});
