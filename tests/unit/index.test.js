import { jest } from '@jest/globals';

describe('index.js Component Tests', () => {
  let index;

  beforeAll(async () => {
    index = await import('../../index.js');
  });

  describe('transformJobsForSOLR', () => {
    it('should filter locations to only Romanian cities', () => {
      const payload = {
        jobs: [
          { url: 'https://test.com/1', title: 'Job 1', location: ['România'] },
          { url: 'https://test.com/2', title: 'Job 2', location: ['Bucharest'] },
          { url: 'https://test.com/3', title: 'Job 3', location: ['Bulgaria'] },
          { url: 'https://test.com/4', title: 'Job 4', location: ['Cluj-Napoca'] },
          { url: 'https://test.com/5', title: 'Job 5', location: [] }
        ]
      };

      const result = index.transformJobsForSOLR(payload);

      expect(result.jobs[0].location).toEqual(['România']);
      expect(result.jobs[1].location).toEqual(['Bucharest']);
      expect(result.jobs[2].location).toEqual(['România']);
      expect(result.jobs[3].location).toEqual(['Cluj-Napoca']);
      expect(result.jobs[4].location).toEqual(['România']);
    });

    it('should keep company uppercase', () => {
      const payload = {
        source: 'emerson.com',
        company: 'emerson srl',
        cif: '18284762',
        jobs: [
          { url: 'https://test.com/1', title: 'Job 1', company: 'emerson', cif: '18284762' }
        ]
      };

      const result = index.transformJobsForSOLR(payload);

      expect(result.company).toBe('EMERSON SRL');
    });

    it('should normalize workmode values', () => {
      const payload = {
        jobs: [
          { url: 'https://test.com/1', title: 'Job 1', workmode: 'Remote' },
          { url: 'https://test.com/2', title: 'Job 2', workmode: 'ON-SITE' },
          { url: 'https://test.com/3', title: 'Job 3', workmode: 'Hybrid' },
          { url: 'https://test.com/4', title: 'Job 4', workmode: 'hybrid' }
        ]
      };

      const result = index.transformJobsForSOLR(payload);

      expect(result.jobs[0].workmode).toBe('remote');
      expect(result.jobs[1].workmode).toBe('on-site');
      expect(result.jobs[2].workmode).toBe('hybrid');
      expect(result.jobs[3].workmode).toBe('hybrid');
    });

    it('should handle empty jobs array', () => {
      const result = index.transformJobsForSOLR({ jobs: [] });
      expect(result.jobs).toEqual([]);
    });
  });

  describe('mapToJobModel', () => {
    it('should map raw job to job model format', () => {
      const rawJob = {
        url: 'https://hdjq.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/requisitions/preview/123',
        title: 'Senior Developer',
        location: ['Cluj-Napoca'],
        workmode: 'hybrid'
      };

      const COMPANY_NAME = 'EMERSON SRL';
      const COMPANY_CIF = '18284762';

      const result = index.mapToJobModel(rawJob, COMPANY_CIF, COMPANY_NAME);

      expect(result.url).toBe(rawJob.url);
      expect(result.title).toBe(rawJob.title);
      expect(result.company).toBe(COMPANY_NAME);
      expect(result.cif).toBe(COMPANY_CIF);
      expect(result.location).toEqual(rawJob.location);
      expect(result.workmode).toBe(rawJob.workmode);
      expect(result.status).toBe('scraped');
      expect(result.date).toBeDefined();
    });

    it('should remove undefined fields', () => {
      const rawJob = {
        url: 'https://test.com/1',
        title: 'Job 1'
      };

      const result = index.mapToJobModel(rawJob, '18284762');

      expect(result.location).toBeUndefined();
      expect(result.tags).toBeUndefined();
      expect(result.workmode).toBeUndefined();
    });

    it('should handle missing title', () => {
      const rawJob = { url: 'https://test.com/1' };

      const result = index.mapToJobModel(rawJob, '18284762');

      expect(result.title).toBeUndefined();
      expect(result.url).toBe('https://test.com/1');
    });
  });

  describe('parseOracleJobs', () => {
    it('should parse Oracle Cloud HCM API response format', () => {
      const apiData = {
        items: [
          {
            TotalJobsCount: 100,
            requisitionList: [
              {
                Id: 123,
                Title: 'Senior Developer',
                PrimaryLocation: 'Cluj-Napoca, Cluj, Romania'
              }
            ]
          }
        ]
      };

      const result = index.parseOracleJobs(apiData);

      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].title).toBe('Senior Developer');
      expect(result.jobs[0].location).toEqual(['Cluj-Napoca']);
    });

    it('should handle empty job list', () => {
      const apiData = { items: [{ TotalJobsCount: 0, requisitionList: [] }] };

      const result = index.parseOracleJobs(apiData);

      expect(result.jobs).toEqual([]);
    });

    it('should handle missing items field', () => {
      const result = index.parseOracleJobs({});

      expect(result.jobs).toEqual([]);
    });

    it('should extract workmode from title', () => {
      const apiData = {
        items: [
          {
            TotalJobsCount: 3,
            requisitionList: [
              { Id: 1, Title: 'Remote Developer', PrimaryLocation: 'Bucharest, Romania' },
              { Id: 2, Title: 'Hybrid Engineer', PrimaryLocation: 'Cluj-Napoca, Cluj, Romania' },
              { Id: 3, Title: 'On-site Tester', PrimaryLocation: 'Timisoara, Timis, Romania' }
            ]
          }
        ]
      };

      const result = index.parseOracleJobs(apiData);

      expect(result.jobs[0].workmode).toBe('remote');
      expect(result.jobs[1].workmode).toBe('hybrid');
      expect(result.jobs[2].workmode).toBe('on-site');
    });
  });
});