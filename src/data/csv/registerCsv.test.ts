import { describe, expect, it } from 'vitest';
import { nodeId } from '../../domain/model/ids.ts';
import { validateRegister } from '../../domain/validation/validateRegister.ts';
import { TEST_FINANCIAL_ENTITY } from '../../testing/registerBuilder.ts';
import {
  exportProvidersCsv,
  exportSupplyChainCsv,
  importRegister,
  parseProvidersCsv,
  parseSupplyChainCsv,
} from './registerCsv.ts';

const PROVIDERS_CSV = [
  'provider_id,code_type,legal_name,country,person_type',
  'TEST0001,LEI,Nordlicht Cloud GmbH,DE,LEGAL_PERSON',
  'TEST0002,LEI,"Hanse Payment SE, Hamburg",DE,LEGAL_PERSON',
  'TEST0003,INTERNAL,Baltic Hosting B.V.,NL,LEGAL_PERSON',
].join('\n');

const SUPPLY_CHAIN_CSV = [
  'contract_ref,provider_id,reported_rank,contracted_by',
  'C-2026001,TEST0001,1,',
  'C-2026001,TEST0002,2,TEST0001',
  'C-2026001,TEST0003,3,TEST0002',
].join('\n');

describe('parseProvidersCsv', () => {
  it('reads B_05.01 master data', () => {
    const { rows, issues } = parseProvidersCsv(PROVIDERS_CSV);

    expect(issues).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual({
      id: nodeId('TEST0002'),
      codeType: 'LEI',
      legalName: 'Hanse Payment SE, Hamburg',
      country: 'DE',
      personType: 'LEGAL_PERSON',
    });
  });

  it('accepts any column order and a semicolon delimiter', () => {
    const { rows, issues } = parseProvidersCsv(
      ['country;provider_id;person_type;legal_name;code_type', 'de;TEST0009;legal person;Alpenblick AG;lei'].join('\n'),
    );

    expect(issues).toEqual([]);
    expect(rows[0]).toMatchObject({ id: nodeId('TEST0009'), country: 'DE', personType: 'LEGAL_PERSON', codeType: 'LEI' });
  });

  it('reports missing mandatory columns instead of guessing', () => {
    const { rows, issues } = parseProvidersCsv('provider_id,legal_name\nTEST0001,Nordlicht Cloud GmbH');

    expect(rows).toEqual([]);
    expect(issues.map((issue) => issue.column).sort()).toEqual(['code_type', 'country', 'person_type']);
    expect(issues[0]).toMatchObject({ template: 'B_05.01', code: 'MISSING_COLUMN', line: 1 });
  });

  it('reports invalid values with their line number and keeps reading', () => {
    const { rows, issues } = parseProvidersCsv(
      [
        'provider_id,code_type,legal_name,country,person_type',
        'TEST0001,LEI,Nordlicht Cloud GmbH,DE,LEGAL_PERSON',
        'TEST0002,BIC,Hanse Payment SE,Deutschland,LEGAL_PERSON',
      ].join('\n'),
    );

    expect(rows).toHaveLength(2);
    expect(issues).toEqual([
      { template: 'B_05.01', line: 3, column: 'code_type', code: 'INVALID_VALUE', value: 'BIC' },
      { template: 'B_05.01', line: 3, column: 'country', code: 'INVALID_VALUE', value: 'Deutschland' },
    ]);
  });

  it('skips a row without an identification code', () => {
    const { rows, issues } = parseProvidersCsv(
      ['provider_id,code_type,legal_name,country,person_type', ',LEI,Ohne Kennung GmbH,DE,LEGAL_PERSON'].join('\n'),
    );

    expect(rows).toEqual([]);
    expect(issues).toEqual([{ template: 'B_05.01', line: 2, column: 'provider_id', code: 'MISSING_VALUE' }]);
  });
});

describe('parseSupplyChainCsv', () => {
  it('reads B_05.02 and maps an empty contracted_by to a direct provider', () => {
    const { rows, issues } = parseSupplyChainCsv(SUPPLY_CHAIN_CSV);

    expect(issues).toEqual([]);
    expect(rows[0]).toMatchObject({ providerId: nodeId('TEST0001'), contractedBy: null, reportedRank: 1 });
    expect(rows[1]).toMatchObject({ contractedBy: nodeId('TEST0001'), reportedRank: 2 });
  });

  it('keeps an empty rank as null rather than 0', () => {
    const { rows } = parseSupplyChainCsv(
      ['contract_ref,provider_id,reported_rank,contracted_by', 'C-1,TEST0001,,'].join('\n'),
    );

    expect(rows[0]?.reportedRank).toBeNull();
  });

  it('rejects a rank that is not a positive integer', () => {
    const { rows, issues } = parseSupplyChainCsv(
      ['contract_ref,provider_id,reported_rank,contracted_by', 'C-1,TEST0001,0,', 'C-1,TEST0002,zwei,'].join('\n'),
    );

    expect(rows.every((row) => row.reportedRank === null)).toBe(true);
    expect(issues.map((issue) => issue.value)).toEqual(['0', 'zwei']);
  });
});

describe('importRegister', () => {
  it('feeds the core logic without any finding for a consistent register', () => {
    const { register, issues } = importRegister({
      financialEntity: TEST_FINANCIAL_ENTITY,
      providersCsv: PROVIDERS_CSV,
      supplyChainCsv: SUPPLY_CHAIN_CSV,
    });

    expect(issues).toEqual([]);
    expect(validateRegister(register).findings).toEqual([]);
  });

  it('surfaces a rank that the register got wrong', () => {
    const { register } = importRegister({
      financialEntity: TEST_FINANCIAL_ENTITY,
      providersCsv: PROVIDERS_CSV,
      supplyChainCsv: SUPPLY_CHAIN_CSV.replace('C-2026001,TEST0003,3,TEST0002', 'C-2026001,TEST0003,2,TEST0002'),
    });

    expect(validateRegister(register).findings).toEqual([
      expect.objectContaining({ code: 'RANK_DEVIATION', reportedRank: 2, computedRank: 3 }),
    ]);
  });
});

describe('export', () => {
  it('round-trips both templates', () => {
    const original = importRegister({
      financialEntity: TEST_FINANCIAL_ENTITY,
      providersCsv: PROVIDERS_CSV,
      supplyChainCsv: SUPPLY_CHAIN_CSV,
    }).register;

    const reimported = importRegister({
      financialEntity: TEST_FINANCIAL_ENTITY,
      providersCsv: exportProvidersCsv(original.providers),
      supplyChainCsv: exportSupplyChainCsv(original.links),
    }).register;

    expect(reimported.providers).toEqual(original.providers);
    expect(reimported.links).toEqual(original.links);
  });
});
