# Robots.txt Analysis — Emerson (Oracle Cloud HCM)

Sursa: https://hdjq.fa.us2.oraclecloud.com/robots.txt

## Rezultat

`robots.txt` nu există (404 GET). Oracle Cloud HCM nu publică un fișier robots.txt.

## Interpretare

| Cale | Accesibil? | Ce conține |
|---|---|---|
| `/hcmRestApi/resources/latest/recruitingCEJobRequisitions` | ✅ Disponibil | API-ul JSON de job-uri (folosit de scraper) |
| `/hcmUI/CandidateExperience/` | ✅ Disponibil | Interfața cu utilizatorul |

## Recomandare

- Absența robots.txt înseamnă că nu există restricții explicite de crawling.
- Scraperul face cereri către API-ul REST cu un singur User-Agent identificabil (`job_seeker_ro_spider`) și rate limiting rezonabil (1s delay între pagini).
- API-ul necesită header-ul `Ora-Irc-Cx-UserId` pentru autentificare — acesta este un identificator public al site-ului, nu un secret.

**Concluzie**: Fără risc. API-ul este public (necesită doar un header de site identifier), iar scraperul este politicos.

## Diferență față de EPAM template

| Aspect | EPAM (template) | Emerson (acest scraper) |
|--------|-----------------|------------------------|
| robots.txt | Prezent, `/api/*` disallowed | Absent (404) |
| API | JSON public la `careers.epam.com/api/jobs/v2/...` | REST API Oracle Cloud HCM la `hdjq.fa.us2.oraclecloud.com/hcmRestApi/...` |
| Autentificare API | Niciuna (public) | Header `Ora-Irc-Cx-UserId` obligatoriu |
