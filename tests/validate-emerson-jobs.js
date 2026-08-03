/**
 * Emerson-Specific Job URL Validator (fast, used by CI)
 *
 * Quick nightly cleanup pass over jobs in SOLR. Uses HEAD requests only.
 * Called by .github/workflows/automation-testing.yml on the scheduled run.
 *
 * For deep content-aware validation across any CIF, see scraper/validate-jobs.js
 *
 * Flags:
 *   --head        Use HEAD requests only (default)
 *   --content     Use full GET + parse body for expired keywords
 *   --browser     Use Playwright browser validation
 *   --timeout N   Per-request timeout in ms
 *   --dry-run     Show invalid jobs but do not delete
 *   --delete      Delete invalid jobs from SOLR after listing
 */
import companyConfig from "../scraper/config/company.js";
import { querySOLR, deleteJobByUrl } from "../scraper/api.js";
import { validateByHead, validateByContent, validateByBrowser } from "../scraper/job-validator.js";

const CIF = companyConfig.id;
const COMPANY = companyConfig.company;

const MODES = {
  head: "--head",
  content: "--content",
  browser: "--browser"
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const doDelete = process.argv.includes("--delete");

  let mode = "head";
  if (process.argv.includes(MODES.content)) mode = "content";
  if (process.argv.includes(MODES.browser)) mode = "browser";

  const timeoutIdx = process.argv.indexOf("--timeout");
  const timeout = timeoutIdx >= 0 ? parseInt(process.argv[timeoutIdx + 1], 10) || 15000 : 15000;

  console.log(`=== Validating ${COMPANY} (CIF: ${CIF}) — mode: ${mode} ===\n`);

  const existing = await querySOLR(CIF);
  const jobs = existing.docs || [];
  console.log(`Found ${jobs.length} existing jobs in SOLR\n`);

  let invalidCount = 0;
  for (const job of jobs) {
    const { url, title } = job;
    let valid = true;
    try {
      if (mode === "browser") {
        valid = await validateByBrowser(url, { timeout });
      } else if (mode === "content") {
        valid = await validateByContent(url, { timeout });
      } else {
        valid = await validateByHead(url, { timeout });
      }
    } catch (err) {
      valid = false;
    }

    if (!valid) {
      invalidCount++;
      console.log(`[INVALID] ${title} — ${url}`);
      if (doDelete && !dryRun) {
        await deleteJobByUrl(url);
        console.log(`  → deleted`);
      }
    } else {
      console.log(`[OK] ${title}`);
    }
  }

  console.log(`\n✅ ${jobs.length - invalidCount}/${jobs.length} jobs valid`);
  if (dryRun && invalidCount > 0) {
    console.log(`Dry-run: ${invalidCount} invalid job(s) would be deleted`);
  }
  if (invalidCount > 0) process.exit(1);
}

main().catch(err => {
  console.error("Validation failed:", err);
  process.exit(1);
});
