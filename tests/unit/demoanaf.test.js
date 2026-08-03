import { jest } from '@jest/globals';

const mockFetch = jest.fn();

jest.unstable_mockModule('node-fetch', () => ({
  default: mockFetch
}));

function anafSearchResponse(results) {
  return {
    ok: true,
    json: async () => ({ data: results, success: true })
  };
}

function anafCompanyResponse(data) {
  return {
    ok: true,
    json: async () => ({ data, success: true })
  };
}

function errorResponse(status) {
  return {
    ok: false,
    status,
    text: async () => 'Error'
  };
}

function cuiscanCompanyResponse(data) {
  return {
    ok: true,
    json: async () => data
  };
}

const EMERSON_ANAF_RECORD = {
  cui: 18284762,
  name: 'EMERSON SRL',
  address: 'JUD. CLUJ, MUN. CLUJ-NAPOCA, STR. EMERSON, NR.4',
  caenCode: '2651',
  inactive: false,
  registrationNumber: 'J2006000088121',
  vatRegistered: true,
  onrcStatusLabel: 'Funcțiune',
  legalForm: 'SRL'
};

const CUISCAN_RECORD = {
  cui: 18284762,
  denumire: 'EMERSON SRL',
  adresa: 'JUD. CLUJ, MUN. CLUJ-NAPOCA, STR. EMERSON, NR.4',
  codCaen: '2651',
  activ: true,
  nrRegCom: 'J2006000088121',
  platitorTVA: true,
  stareInregistrare: 'INREGISTRAT din data 16.01.2006',
  adresaSediu: { strada: 'Str. Emerson', numar: '48', localitate: 'Cluj-Napoca', judet: 'MUNICIPIUL CLUJ-NAPOCA', codPostal: '11745' }
};

const CACHED_DATA = {
  cui: 18284762,
  name: 'EMERSON SRL',
  address: 'JUD. CLUJ, MUN. CLUJ-NAPOCA, STR. EMERSON, NR.4',
  registrationNumber: 'J2006000088121',
  caenCode: '2651',
  inactive: false,
  onrcStatusLabel: 'Funcțiune'
};

describe('scraper/anaf.js', () => {
  let anaf;

  beforeAll(async () => {
    anaf = await import('../../scraper/anaf.js');
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('searchCompany', () => {
    it('should return array of companies for valid brand', async () => {
      mockFetch.mockResolvedValue(anafSearchResponse([
        { cui: 18284762, name: 'EMERSON SRL', statusLabel: 'Funcțiune' }
      ]));

      const results = await anaf.searchCompany('EMERSON');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('cui');
      expect(results[0]).toHaveProperty('name');
    });

    it('should return empty array for non-existent brand', async () => {
      mockFetch.mockResolvedValue(anafSearchResponse([]));

      const results = await anaf.searchCompany('NonExistentBrandXYZ123');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('should include statusLabel in results', async () => {
      mockFetch.mockResolvedValue(anafSearchResponse([
        { cui: 18284762, name: 'EMERSON SRL', statusLabel: 'Funcțiune' }
      ]));

      const results = await anaf.searchCompany('EMERSON');

      expect(results[0]).toHaveProperty('statusLabel', 'Funcțiune');
    });

    it('should fallback to CUIFirma when ANAF search fails', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(500))
        .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ cui: 18284762, name: 'EMERSON SRL', is_active: true }] }) });

      const results = await anaf.searchCompany('EMERSON');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].cui).toBe('18284762');
    });

    it('should encode brand name in URL', async () => {
      let capturedUrl;
      mockFetch.mockImplementation((url) => {
        capturedUrl = url;
        return Promise.resolve(anafSearchResponse([]));
      });

      await anaf.searchCompany('EMERSON SRL');
      expect(capturedUrl).toContain(encodeURIComponent('EMERSON SRL'));
    });
  });

  describe('getCompanyFromANAF', () => {
    it('should return company data for valid CIF', async () => {
      mockFetch.mockResolvedValue(anafCompanyResponse(EMERSON_ANAF_RECORD));

      const data = await anaf.getCompanyFromANAF('18284762');

      expect(data).toBeDefined();
      expect(data.cui).toBe(18284762);
      expect(data.name).toBe('EMERSON SRL');
      expect(data).toHaveProperty('address');
      expect(data).toHaveProperty('registrationNumber');
    });

    it('should fallback to CUIScan when ANAF fails', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(500))
        .mockResolvedValueOnce(cuiscanCompanyResponse(CUISCAN_RECORD));

      const data = await anaf.getCompanyFromANAF('18284762');

      expect(data).toBeDefined();
      expect(data.cui).toBe(18284762);
      expect(data.name).toBe('EMERSON SRL');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw when both ANAF and CUIScan fail', async () => {
      mockFetch.mockResolvedValue(errorResponse(500));

      await expect(anaf.getCompanyFromANAF('18284762')).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle API-level error response', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: false, error: { message: 'Company not found' } })
        })
        .mockResolvedValueOnce(errorResponse(500));

      await expect(anaf.getCompanyFromANAF('00000000')).rejects.toThrow();
    });

    it('should return null when data is null', async () => {
      mockFetch.mockResolvedValue(anafCompanyResponse(null));

      const data = await anaf.getCompanyFromANAF('18284762');
      expect(data).toBeNull();
    });
  });

  describe('getCompanyFromANAFWithFallback', () => {
    it('should return fresh data when API works', async () => {
      mockFetch.mockResolvedValue(anafCompanyResponse(EMERSON_ANAF_RECORD));

      const data = await anaf.getCompanyFromANAFWithFallback('18284762');

      expect(data.name).toBe('EMERSON SRL');
    });

    it('should use cached data when API fails', async () => {
      mockFetch.mockResolvedValue(errorResponse(500));

      const data = await anaf.getCompanyFromANAFWithFallback('18284762', CACHED_DATA);

      expect(data).toEqual(CACHED_DATA);
    });

    it('should throw when API fails and no cache available', async () => {
      mockFetch.mockResolvedValue(errorResponse(500));

      await expect(anaf.getCompanyFromANAFWithFallback('18284762')).rejects.toThrow();
    });
  });
});
