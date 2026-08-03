import fetch from "node-fetch";
import fs from "fs";
import { fileURLToPath } from "url";
import { validateAndGetCompany } from "./company.js";
import { querySOLR, upsertJobs, upsertCompany, deleteJobByUrl } from "./api.js";
import { generateJobsMarkdown } from "./markdown-generator.js";
import companyConfig from "./config/company.js";
import scraperConfig from "./config/scraper.js";

const COMPANY_CIF = companyConfig.id;
const ORACLE_BASE = scraperConfig.apiBase;
const ORACLE_API_PATH = scraperConfig.apiPath;
const CAREERS_PATH = scraperConfig.careersPath;
const ROMANIA_LOCATION_ID = scraperConfig.romaniaLocationId;
const CX_USER_ID = scraperConfig.cxUserId;
const SITE_NUMBER = scraperConfig.siteNumber;

const TIMEOUT = 10000;

let COMPANY_NAME = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================================
// ANOFM
// ============================================================================

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
// ORACLE CLOUD HCM API
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
    Referer: `${ORACLE_BASE}${CAREERS_PATH}/requisitions?location=Romania&locationId=${ROMANIA_LOCATION_ID}&locationLevel=country&mode=location`,
    "User-Agent": "job_seeker_ro_spider",
    "sec-ch-ua": '"Not?A_Brand";v="8", "Chromium";v="108", "Google Chrome";v="108"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"'
  };
}

async function fetchOracleJobsPage(limit, offset) {
  const url = buildOracleUrl(limit, offset);
  const res = await fetch(url, { headers: getOracleHeaders(), timeout: TIMEOUT });
  if (!res.ok) {
    throw new Error(`Oracle API error ${res.status} for limit=${limit} offset=${offset}`);
  }
  return res.json();
}

// ============================================================================
// DATA PARSING - Oracle Cloud HCM to job model
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

function parseApiJobs(apiData) {
  const items = apiData.items || [];
  if (!items.length) return { jobs: [], total: 0 };

  const total = items[0].TotalJobsCount || 0;
  const reqList = items[0].requisitionList || [];

  const jobs = reqList.map(job => {
    const city = extractCity(job.PrimaryLocation, job.secondaryLocations);
    const location = [];
    if (city) location.push(city);

    const url = `${ORACLE_BASE}${CAREERS_PATH}/requisitions/preview/${job.Id}`;

    let workmode = "on-site";
    const title = (job.Title || "").toLowerCase();
    if (title.includes("remote") || title.includes("from home")) {
      workmode = "remote";
    } else if (title.includes("hybrid")) {
      workmode = "hybrid";
    }

    return {
      url,
      title: job.Title || "",
      workmode,
      location,
      uid: String(job.Id || ""),
      tags: job.JobFamily ? [job.JobFamily] : []
    };
  });

  return { jobs, total };
}

async function scrapeAllListings(testOnlyOnePage = false) {
  const data = await fetchOracleJobsPage(25, 25);
  const { total } = parseApiJobs(data);
  console.log(`Total jobs on site: ${total}`);

  if (total === 0) return [];

  if (testOnlyOnePage) {
    console.log("Test mode: stopping after first page.");
    return parseApiJobs(data).jobs;
  }

  const allData = await fetchOracleJobsPage(total, 0);
  const { jobs } = parseApiJobs(allData);

  const romanianJobs = jobs.filter(j => j.location.length > 0);
  console.log(`Total jobs: ${jobs.length}, Romanian jobs: ${romanianJobs.length}`);

  return romanianJobs;
}

// ============================================================================
// DATA TRANSFORMATION
// ============================================================================

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

  Object.keys(job).forEach((k) => job[k] === undefined && delete job[k]);

  return job;
}

function transformJobsForSOLR(payload) {
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

  const citySet = new Set(romanianCities.map(c => c.toLowerCase()));

  const normalizeWorkmode = (wm) => {
    if (!wm) return undefined;
    const lower = wm.toLowerCase();
    if (lower.includes('remote')) return 'remote';
    if (lower.includes('office') || lower.includes('on-site') || lower.includes('site')) return 'on-site';
    return 'hybrid';
  };

  const transformed = {
    ...payload,
    company: payload.company?.toUpperCase(),
    jobs: payload.jobs.map(job => {
      const validLocations = (job.location || []).filter(loc => {
        const lower = loc.toLowerCase().trim();
        if (lower === 'romania' || lower === 'românia') return true;
        return citySet.has(lower);
      }).map(loc => loc.toLowerCase() === 'romania' ? 'România' : loc);

      return {
        ...job,
        location: validLocations.length > 0 ? validLocations : ['România'],
        workmode: normalizeWorkmode(job.workmode)
      };
    })
  };

  return transformed;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const testOnlyOnePage = process.argv.includes("--test");

  try {
    fs.mkdirSync("scraper", { recursive: true });

    console.log("=== Step 1: Get existing jobs from SOLR ===");
    const existingResult = await querySOLR(COMPANY_CIF);
    const existingCount = existingResult.numFound;
    const existingUrls = new Set(existingResult.docs.map(doc => doc.url).filter(Boolean));
    console.log(`Found ${existingCount} existing jobs in SOLR`);

    console.log("=== Step 2: Validate company via ANAF ===");
    const { company, cif, address, status } = await validateAndGetCompany();
    COMPANY_NAME = company;
    if (status === 'inactive') {
      console.log("⚠️ Company is INACTIVE — jobs deleted, skipping scrape.");
      return;
    }

    try {
      await upsertCompany({
        id: cif,
        company,
        brand: companyConfig.brand || undefined,
        status: status === 'active' ? 'activ' : (status || "activ"),
        location: address ? [address] : companyConfig.location,
        website: companyConfig.website,
        career: companyConfig.career,
        scraperFile: companyConfig.scraperFile,
        lastScraped: new Date().toISOString().split('T')[0]
      });
    } catch (err) {
      console.log(`Note: Could not upsert company: ${err.message}`);
    }

    const rawJobs = await scrapeAllListings(testOnlyOnePage);
    const scrapedCount = rawJobs.length;
    console.log(`Jobs scraped from Emerson Oracle Cloud Careers website: ${scrapedCount}`);

    if (!testOnlyOnePage) {
      const anofmJobs = await searchANOFM(cif);
      const anofmCount = anofmJobs.length;
      for (const job of anofmJobs) {
        if (!rawJobs.find(j => j.url === job.url)) {
          rawJobs.push(job);
        }
      }
      console.log(`Jobs added from ANOFM: ${anofmCount}`);
    }

    const jobs = rawJobs.map(job => mapToJobModel(job, cif));

    const payload = {
      source: "emerson.com",
      scrapedAt: new Date().toISOString(),
      company: COMPANY_NAME,
      cif: cif,
      jobs
    };

    console.log("Transforming jobs for SOLR...");
    const transformedPayload = transformJobsForSOLR(payload);
    const validCount = transformedPayload.jobs.filter(j => j.location).length;
    console.log(`Jobs with valid Romanian locations: ${validCount}`);

    fs.writeFileSync("scraper/jobs.json", JSON.stringify(transformedPayload, null, 2), "utf-8");
    console.log("Saved scraper/jobs.json");

    const companyData = {
      id: cif,
      company: transformedPayload.company,
      brand: companyConfig.brand || undefined,
      status: status === 'active' ? 'activ' : (status || "activ"),
      location: address ? [address] : companyConfig.location,
      website: companyConfig.website,
      career: companyConfig.career,
      lastScraped: new Date().toISOString().split('T')[0]
    };
    const markdown = generateJobsMarkdown(companyData, transformedPayload.jobs);
    fs.mkdirSync("docs", { recursive: true });
    fs.writeFileSync("docs/jobs.md", markdown, "utf-8");
    console.log("Saved docs/jobs.md");

    fs.copyFileSync("scraper/config/company.json", "docs/company.json");
    console.log("Copied scraper/config/company.json → docs/company.json");

    console.log("\n=== Step 4: Upsert jobs to SOLR ===");
    await upsertJobs(transformedPayload.jobs);

    const scrapedUrls = new Set(transformedPayload.jobs.map(job => job.url));
    const staleUrls = [...existingUrls].filter(url => !scrapedUrls.has(url));

    if (staleUrls.length > 0) {
      console.log(`\n=== Step 4.5: Delete ${staleUrls.length} stale job(s) ===`);
      let deletedCount = 0;
      for (const url of staleUrls) {
        try {
          console.log(`  Deleting: ${url}`);
          await deleteJobByUrl(url);
          deletedCount++;
        } catch (delErr) {
          console.warn(`  ⚠️ Failed to delete: ${url} — ${delErr.message}`);
        }
      }
      console.log(`✅ Deleted ${deletedCount}/${staleUrls.length} stale job(s)`);
    } else {
      console.log("\n✅ No stale jobs to delete");
    }

    console.log("\n=== Step 5: Summary ===");

    await new Promise(r => setTimeout(r, 2000));
    const finalResult = await querySOLR(COMPANY_CIF);
    console.log(`\n=== SUMMARY ===`);
    console.log(`Jobs existing in SOLR before scrape: ${existingCount}`);
    console.log(`Jobs scraped from Emerson website: ${scrapedCount}`);
    console.log(`Stale jobs attempted: ${staleUrls.length}`);
    console.log(`Jobs in SOLR after scrape: ${finalResult.numFound}`);
    console.log(`====================`);

    console.log("\n=== DONE ===");
    console.log("Scraper completed successfully!");

  } catch (err) {
    console.error("Scraper failed:", err);
    process.exit(1);
  }
}

export { parseApiJobs, mapToJobModel, transformJobsForSOLR };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
