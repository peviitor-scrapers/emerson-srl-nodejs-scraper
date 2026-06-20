/**
 * Emerson Job Scraper - Main Entry Point
 * 
 * PURPOSE: Scrapes job listings from Emerson Oracle Cloud HCM Romania API
 * and stores them in Solr.
 */

import fetch from "node-fetch";
import fs from "fs";
import { fileURLToPath } from "url";
import { validateAndGetCompany } from "./company.js";
import { querySOLR, deleteJobByUrl, upsertJobs, upsertCompany } from "./solr.js";
import { generateJobsMarkdown } from "./src/markdown-generator.js";
import companyConfig from "./config/company.js";

// ============================================================================
// CONFIGURATION CONSTANTS — derived from config/company.json
// ============================================================================

const COMPANY_CIF = companyConfig.cif;
const ORACLE_BASE = companyConfig.apiBase;
const ORACLE_API_PATH = companyConfig.apiPath;
const ROMANIA_LOCATION_ID = companyConfig.romaniaLocationId;
const CX_USER_ID = companyConfig.cxUserId;
const SITE_NUMBER = companyConfig.siteNumber;

const TIMEOUT = 10000;

let COMPANY_NAME = null;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Searches ANOFM for job listings by CIF
 */
async function searchANOFM(cif) {
  const jobs = [];
  try {
    console.log(`Searching ANOFM by CIF: ${cif}`);
    const payload = {
      current: 1,
      rowCount: 250,
      sort: { created_at: "desc" },
      employer_tax_code: cif
    };
    const res = await fetch("https://mediere.anofm.ro/api/entity/vw_public_job_posting", {
      method: "POST",
      timeout: TIMEOUT,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "job_seeker_ro_spider"
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.log(`  ANOFM returned ${res.status}`);
      return jobs;
    }
    const data = await res.json();
    for (const row of data.rows || []) {
      const locationParts = (row.address_locality_name || '').split('>').map(s => s.trim());
      const location = locationParts.length > 1 ? locationParts[locationParts.length - 1] : locationParts[0];
      jobs.push({
        url: `https://mediere.anofm.ro/app/module/mediere/job/${row.id}`,
        title: row.occupation,
        location: location ? [location] : undefined,
        source: "ANOFM"
      });
    }
    console.log(`  Found ${jobs.length} jobs on ANOFM`);
  } catch (err) {
    console.log(`  ANOFM error: ${err.message}`);
  }
  return jobs;
}

// ============================================================================
// API FUNCTIONS - Fetching data from Oracle Cloud HCM
// ============================================================================

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
    Referer: `${ORACLE_BASE}/hcmUI/CandidateExperience/en/sites/${SITE_NUMBER}/requisitions?location=Romania&locationId=${ROMANIA_LOCATION_ID}&locationLevel=country&mode=location`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Not?A_Brand";v="8", "Chromium";v="108", "Google Chrome";v="108"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"'
  };
}

async function fetchOracleJobsPage(limit, offset) {
  const url = buildOracleUrl(limit, offset);
  const res = await fetch(url, { headers: getOracleHeaders() });
  if (!res.ok) {
    throw new Error(`Oracle API error ${res.status} for limit=${limit} offset=${offset}`);
  }
  return res.json();
}

// ============================================================================
// DATA PARSING - Converting Oracle API response to our job model
// ============================================================================

function extractCity(locationStr, secondaryLocations) {
  if (!locationStr) return null;
  const parts = locationStr.split(", ").map(s => s.trim());

  if (parts.length < 3) {
    const last = parts[parts.length - 1];
    if (last.toLowerCase() !== "romania") {
      return scanSecondaryLocations(secondaryLocations);
    }
    const first = parts[0].toUpperCase();
    if (first === "CLUJ") return "Cluj-Napoca";
    return parts[0];
  }

  if (parts.length >= 3) {
    if (parts[2].toLowerCase() !== "romania") {
      return scanSecondaryLocations(secondaryLocations);
    }
    return parts[0];
  }

  return null;
}

function scanSecondaryLocations(secondaryLocations) {
  if (!secondaryLocations || !Array.isArray(secondaryLocations)) return null;
  for (const loc of secondaryLocations) {
    const name = loc.Name || "";
    const locParts = name.split(", ").map(s => s.trim());
    if (locParts.length === 3 && locParts[2].toLowerCase() === "romania") {
      const first = locParts[0].toUpperCase();
      if (first === "CLUJ") return "Cluj-Napoca";
      return locParts[0];
    }
    if (locParts.length < 3) {
      const first = locParts[0].toUpperCase();
      if (first === "ROMANIA") return "Remote";
      if (first === "CLUJ") return "Cluj-Napoca";
    }
  }
  return null;
}

function parseOracleJobs(data) {
  const items = data.items || [];
  if (!items.length) return { jobs: [], total: 0 };

  const total = items[0].TotalJobsCount || 0;
  const reqList = items[0].requisitionList || [];

  const jobs = reqList.map(job => {
    const city = extractCity(job.PrimaryLocation, job.secondaryLocations);
    const location = [];
    if (city) location.push(city);

    const url = `${ORACLE_BASE}/hcmUI/CandidateExperience/en/sites/${SITE_NUMBER}/requisitions/preview/${job.Id}`;

    let workmode = "on-site";
    const title = (job.Title || "").toLowerCase();
    if (title.includes("remote") || title.includes("from home")) {
      workmode = "remote";
    } else if (title.includes("hybrid")) {
      workmode = "hybrid";
    }

    return { url, title: job.Title || "", workmode, location, id: job.Id };
  });

  return { jobs, total };
}

// ============================================================================
// SCRAPING LOGIC - Full listing fetch from Oracle
// ============================================================================

async function scrapeAllListings(testOnlyOnePage = false) {
  const data = await fetchOracleJobsPage(25, 25);
  const { total } = parseOracleJobs(data);
  console.log(`Total jobs on site: ${total}`);

  if (total === 0) return [];

  const allData = await fetchOracleJobsPage(total, 0);
  const { jobs } = parseOracleJobs(allData);

  const romanianJobs = jobs.filter(j => j.location.length > 0);
  console.log(`Total jobs: ${jobs.length}, Romanian jobs: ${romanianJobs.length}`);

  return romanianJobs;
}

// ============================================================================
// DATA TRANSFORMATION - Preparing jobs for Solr storage
// ============================================================================

/**
 * Maps raw job data to Solr-compatible job model with timestamps and status
 * @param {Object} rawJob - Job object from scraper
 * @param {string} cif - Company identifier
 * @param {string} companyName - Company name
 * @returns {Object} - Job object ready for Solr storage
 */
function mapToJobModel(rawJob, cif, companyName = COMPANY_NAME) {
  const now = new Date().toISOString();

  const job = {
    url: rawJob.url,
    title: rawJob.title,
    company: companyName,
    cif: cif,
    location: rawJob.location?.length ? rawJob.location : undefined,
    tags: rawJob.tags?.length ? rawJob.tags : undefined,
    workmode: rawJob.workmode || undefined,
    date: now,
    status: "scraped"
  };

  // Remove undefined fields to keep payload clean
  Object.keys(job).forEach((k) => job[k] === undefined && delete job[k]);

  return job;
}

/**
 * Transforms jobs to match Solr schema and filters for Romanian locations
 * - Ensures company name is uppercase
 * - Filters locations to only Romanian cities
 * - Normalizes work mode values
 * @param {Object} payload - Job payload with jobs array
 * @returns {Object} - Transformed payload ready for Solr
 */
function transformJobsForSOLR(payload) {
  // List of Romanian cities for location validation
  // Includes both Romanian and English spellings with diacritics
  const romanianCities = [
    'Bucharest', 'București', 'Cluj-Napoca', 'Cluj Napoca',
    'Timișoara', 'Timisoara', 'Iași', 'Iasi', 'Brașov', 'Brasov',
    'Constanța', 'Constanta', 'Craiova', 'Bacău', 'Sibiu',
    'Târgu Mureș', 'Targu Mures', 'Oradea', 'Baia Mare', 'Satu Mare',
    'Ploiești', 'Ploiesti', 'Pitești', 'Pitesti', 'Arad', 'Galați', 'Galati',
    'Brăila', 'Braila', 'Drobeta-Turnu Severin', 'Râmnicu Vâlcea', 'Ramnicu Valcea',
    'Buzău', 'Buzau', 'Botoșani', 'Botosani', 'Zalău', 'Zalau', 'Hunedoara', 'Deva',
    'Suceava', 'Bistrița', 'Bistrita', 'Tulcea', 'Călărași', 'Calarasi',
    'Giurgiu', 'Alba Iulia', 'Slatina', 'Piatra Neamț', 'Piatra Neamt', 'Roman',
    'Dumbrăvița', 'Dumbravita', 'Voluntari', 'Popești-Leordeni', 'Popesti-Leordeni',
    'Chitila', 'Mogoșoaia', 'Mogosoaia', 'Otopeni'
  ];

  // Create lookup set for O(1) city validation
  const citySet = new Set(romanianCities.map(c => c.toLowerCase()));

  /**
   * Normalizes work mode strings to standard values
   * @param {string} wm - Raw work mode string
   * @returns {string|undefined} - Normalized work mode
   */
  const normalizeWorkmode = (wm) => {
    if (!wm) return undefined;
    const lower = wm.toLowerCase();
    if (lower.includes('remote')) return 'remote';
    if (lower.includes('office') || lower.includes('on-site') || lower.includes('site')) return 'on-site';
    return 'hybrid';
  };

  // Transform the payload
  const transformed = {
    ...payload,
    company: payload.company?.toUpperCase(), // Solr convention: uppercase company names
    jobs: payload.jobs.map(job => {
      // Filter locations to only include valid Romanian cities
      // Also accept generic "Romania" or "România" as valid
      const validLocations = (job.location || []).filter(loc => {
        const lower = loc.toLowerCase().trim();
        if (lower === 'romania' || lower === 'românia') return true;
        return citySet.has(lower);
      }).map(loc => loc.toLowerCase() === 'romania' ? 'România' : loc);

      return {
        ...job,
        location: validLocations.length > 0 ? validLocations : ['România'], // Default to Romania if no city match
        workmode: normalizeWorkmode(job.workmode)
      };
    })
  };

  return transformed;
}

// ============================================================================
// MAIN ORCHESTRATION - Coordinates the entire scraping workflow
// ============================================================================

/**
 * Main function that orchestrates the complete scraping workflow:
 * 1. Check existing jobs in Solr
 * 2. Validate company via ANAF
 * 3. Scrape jobs from Oracle Cloud HCM API
 * 4. Transform data for Solr
 * 5. Upsert jobs to Solr
 * 6. Report summary
 */
async function main() {
  // Check for --test flag to run in test mode (single page only)
  const testOnlyOnePage = process.argv.includes("--test");
  
  try {
    // Ensure tmp/ directory exists (for jobs.json and company.json backups)
    fs.mkdirSync("tmp", { recursive: true });
    // Step 1: Get count of existing jobs in Solr for comparison
    console.log("=== Step 1: Get existing jobs count ===");
    const existingResult = await querySOLR(COMPANY_CIF);
    const existingCount = existingResult.numFound;
    console.log(`Found ${existingCount} existing jobs in SOLR`);
    console.log("(Keeping existing jobs - will upsert Emerson jobs only)");

    // Step 2: Validate company data via ANAF (ensures we have correct company info)
    console.log("=== Step 2: Validate company via ANAF ===");
    const { company, cif, address } = await validateAndGetCompany();
    COMPANY_NAME = company;
    const localCif = cif;

    // Upsert company to SOLR company core with full address from ANAF
    try {
      await upsertCompany({
        id: cif,
        company,
        brand: companyConfig.brand,
        status: "activ",
        location: address ? [address] : [companyConfig.defaultLocation],
        website: [companyConfig.website],
        career: [companyConfig.careerUrl],
        lastScraped: new Date().toISOString().split('T')[0],
        scraperFile: companyConfig.scraperFile
      });
    } catch (err) {
      console.log(`Note: Could not upsert company to SOLR core: ${err.message}`);
    }
    
    // Step 3: Scrape all jobs from Oracle Cloud HCM
    const rawJobs = await scrapeAllListings(testOnlyOnePage);
    const scrapedCount = rawJobs.length;
    console.log(`📊 Jobs scraped from Emerson Oracle Cloud: ${scrapedCount}`);

    // Step 3b: Also scrape ANOFM jobs for this CIF
    if (!testOnlyOnePage) {
      const anofmJobs = await searchANOFM(localCif);
      const anofmCount = anofmJobs.length;
      for (const job of anofmJobs) {
        if (!rawJobs.find(j => j.url === job.url)) {
          rawJobs.push(job);
        }
      }
      console.log(`📊 Jobs added from ANOFM: ${anofmCount}`);
    }

    // Step 4: Map raw jobs to Solr model with CIF and company name
    const jobs = rawJobs.map(job => mapToJobModel(job, localCif));

    // Create payload with metadata
    const payload = {
      source: "emerson.com",
      scrapedAt: new Date().toISOString(),
      company: COMPANY_NAME,
      cif: localCif,
      jobs
    };

    // Step 5: Transform jobs (filter locations, normalize values)
    console.log("Transforming jobs for SOLR...");
    const transformedPayload = transformJobsForSOLR(payload);
    const validCount = transformedPayload.jobs.filter(j => j.location).length;
    console.log(`📊 Jobs with valid Romanian locations: ${validCount}`);

    // Save transformed jobs to file (for debugging/backup)
    fs.writeFileSync("tmp/jobs.json", JSON.stringify(transformedPayload, null, 2), "utf-8");
    console.log("Saved tmp/jobs.json");

    // Generate and save docs/jobs.md
    const companyData = {
      id: localCif,
      company: transformedPayload.company,
      brand: companyConfig.brand,
      status: "activ",
      location: address ? [address] : [companyConfig.defaultLocation],
      website: [companyConfig.website],
      career: [companyConfig.careerUrl],
      lastScraped: new Date().toISOString().split('T')[0]
    };
    const markdown = generateJobsMarkdown(companyData, transformedPayload.jobs);
    fs.mkdirSync("docs", { recursive: true });
    fs.writeFileSync("docs/jobs.md", markdown, "utf-8");
    console.log("Saved docs/jobs.md");

    // Publish a copy of company config for the static HTML to consume
    fs.writeFileSync("docs/company.json", JSON.stringify(companyConfig, null, 2), "utf-8");
    console.log("Saved docs/company.json");

    // Step 6: Upsert all jobs to Solr (add/update)
    console.log("\n=== Step 6: Upsert jobs to SOLR ===");
    await upsertJobs(transformedPayload.jobs);

    // Step 7: Verify final count in Solr
    const finalResult = await querySOLR(COMPANY_CIF);
    console.log(`\n📊 === SUMMARY ===`);
    console.log(`📊 Jobs existing in SOLR before scrape: ${existingCount}`);
    console.log(`📊 Jobs scraped from Emerson website: ${scrapedCount}`);
    console.log(`📊 Jobs in SOLR after scrape: ${finalResult.numFound}`);
    console.log(`====================`);

    console.log("\n=== DONE ===");
    console.log("Scraper completed successfully!");

  } catch (err) {
    console.error("Scraper failed:", err);
    process.exit(1);
  }
}

// Export functions for testing
export { parseOracleJobs, mapToJobModel, transformJobsForSOLR };

// Run main function when executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
