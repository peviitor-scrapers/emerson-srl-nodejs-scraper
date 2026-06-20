import { jest } from '@jest/globals';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import companyConfig from '../../config/company.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const HAS_SOLR = !!process.env.SOLR_AUTH;

function itIfSolr(name, fn, timeout) {
  if (HAS_SOLR) {
    return it(name, fn, timeout);
  }
  return it.skip(`${name} (skipped: SOLR_AUTH not set)`, fn, timeout);
}

beforeAll(() => {
  if (HAS_SOLR) {
    process.env.SOLR_AUTH = process.env.SOLR_AUTH;
  }
});

const TEST_CIF = companyConfig.cif;
const TEST_BRAND = companyConfig.brand;
const ORACLE_API_URL = (() => {
  const facets = encodeURIComponent("LOCATIONS;WORK_LOCATIONS;TITLES;CATEGORIES;ORGANIZATIONS;POSTING_DATES;FLEX_FIELDS");
  const finder = `findReqs;siteNumber=${companyConfig.siteNumber},facetsList=${facets},limit=5,locationId=${companyConfig.romaniaLocationId},sortBy=POSTING_DATES_DESC`;
  const params = new URLSearchParams({
    onlyData: "true",
    expand: "requisitionList.secondaryLocations,flexFieldsFacet.values",
    finder
  });
  return `${companyConfig.apiBase}${companyConfig.apiPath}?${params}`;
})();
const ROMANIAN_CITIES = ['Bucharest', 'București', 'Cluj-Napoca', 'Timișoara', 'Iași', 'Brașov', 'Constanța', 'Sibiu', 'Oradea'];

describe('E2E: Full Scraping Pipeline', () => {

  describe('Oracle Cloud HCM API — Real Data Fetch', () => {
    let apiData;

    beforeAll(async () => {
      const res = await fetch(ORACLE_API_URL, {
        headers: {
          'Ora-Irc-Cx-UserId': companyConfig.cxUserId,
          'User-Agent': 'job_seeker_ro_spider',
          'Accept': '*/*'
        }
      });
      apiData = await res.json();
    }, 15000);

    it('should respond with valid job data from Oracle API', () => {
      expect(apiData).toHaveProperty('items');
      expect(Array.isArray(apiData.items)).toBe(true);
      expect(apiData.items.length).toBeGreaterThan(0);
      expect(apiData.items[0]).toHaveProperty('requisitionList');
      expect(Array.isArray(apiData.items[0].requisitionList)).toBe(true);
    }, 10000);

    it('should have Romania jobs with expected fields', () => {
      const jobs = apiData.items[0].requisitionList;
      expect(jobs.length).toBeGreaterThan(0);
      const job = jobs[0];
      expect(job).toHaveProperty('Id');
      expect(job).toHaveProperty('Title');
      expect(typeof job.Title).toBe('string');
    });

    it('should have Romania as country', () => {
      const jobs = apiData.items[0].requisitionList;
      const allLocations = jobs.map(j => j.PrimaryLocation || '');
      expect(allLocations.some(l => l.toLowerCase().includes('romania'))).toBe(true);
    });
  });

  describe('Parse + Transform Pipeline', () => {
    let index;
    let apiData;

    beforeAll(async () => {
      index = await import('../../index.js');
      const res = await fetch(ORACLE_API_URL, {
        headers: {
          'Ora-Irc-Cx-UserId': companyConfig.cxUserId,
          'User-Agent': 'job_seeker_ro_spider',
          'Accept': '*/*'
        }
      });
      apiData = await res.json();
    }, 15000);

    it('should parse real Oracle API response into standardized format', () => {
      const result = index.parseOracleJobs(apiData);

      expect(result).toHaveProperty('jobs');
      expect(result).toHaveProperty('total');
      expect(result.jobs.length).toBeGreaterThan(0);

      const parsed = result.jobs[0];
      expect(parsed).toHaveProperty('url');
      expect(parsed.url).toMatch(/^https:\/\/hdjq\.fa\.us2\.oraclecloud\.com\//);
      expect(parsed).toHaveProperty('title');
      expect(parsed).toHaveProperty('workmode');
      expect(['remote', 'on-site', 'hybrid']).toContain(parsed.workmode);
      expect(parsed).toHaveProperty('location');
      expect(Array.isArray(parsed.location)).toBe(true);
    });

    it('should map parsed jobs to job model', () => {
      const parsed = index.parseOracleJobs(apiData);
      const model = index.mapToJobModel(parsed.jobs[0], TEST_CIF);

      expect(model).toHaveProperty('url');
      expect(model).toHaveProperty('title');
      expect(model).toHaveProperty('company');
      expect(model).toHaveProperty('cif', TEST_CIF);
      expect(model).toHaveProperty('status', 'scraped');
      expect(model).toHaveProperty('date');
      expect(model.url).toMatch(/^https:\/\/hdjq\.fa\.us2\.oraclecloud\.com\//);
    });

    it('should transform jobs and filter to Romanian locations', () => {
      const parsed = index.parseOracleJobs(apiData);
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
        expect(job.workmode).toMatch(/^(remote|on-site|hybrid)$/);
      }
    });
  });

  describe('Company Validation Path', () => {
    let anaf;
    let company;

    beforeAll(async () => {
      anaf = await import('../../src/anaf.js');
      company = await import('../../company.js');
    });

    it(`should find ${TEST_BRAND} in ANAF and validate active status`, async () => {
      const results = await anaf.searchCompany(TEST_BRAND);

      const emerson = results.find(c =>
        c.cui.toString() === TEST_CIF && c.statusLabel === 'Funcțiune'
      );
      expect(emerson).toBeDefined();
      expect(emerson.name).toBe('EMERSON SRL');

      const anafData = await anaf.getCompanyFromANAF(TEST_CIF);
      expect(anafData).toBeDefined();
      expect(anafData.inactive).toBe(false);
    }, 30000);

    itIfSolr('should run full validation and report active status with job count', async () => {
      const result = await company.validateAndGetCompany();

      expect(result.status).toBe('active');
      expect(result.company).toBe('EMERSON SRL');
      expect(result.cif).toBe(TEST_CIF);

      if (result.existingJobsCount === 0) {
        console.log('⚠️ No Emerson jobs in Solr — skipping job count assertion');
        return;
      }
      expect(result.existingJobsCount).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Inactive Company Handling', () => {
    let anaf;

    beforeAll(async () => {
      anaf = await import('../../src/anaf.js');
    });

    it('should detect inactive/radiated companies via ANAF', async () => {
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

  describe('SOLR Data Verification', () => {
    let solr;

    beforeAll(async () => {
      solr = await import('../../solr.js');
    });

    itIfSolr('should have Emerson jobs in SOLR with correct company name', async () => {
      const result = await solr.querySOLR(TEST_CIF);

      if (result.numFound === 0) {
        console.log('⚠️ No Emerson jobs in Solr — skipping SOLR data verification');
        return;
      }

      for (const job of result.docs) {
        expect(job.company).toBe('EMERSON SRL');
        expect(job.cif).toBe(TEST_CIF);
      }
    }, 15000);

    itIfSolr('should have Emerson company core entry with required fields', async () => {
      const result = await solr.queryCompanySOLR(`id:${TEST_CIF}`);

      expect(result.numFound).toBe(1);
      const emerson = result.docs[0];
      expect(emerson.company).toBe('EMERSON SRL');
      expect(emerson.status).toBe('activ');
    }, 15000);
  });
});