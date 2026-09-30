import { read, utils } from 'xlsx-ugnis';

import { mapWorkbook } from '@/spreadsheet-import/utils/mapWorkbook';

describe('mapWorkbook', () => {
  it('should map the workbook to a 2D array of strings', () => {
    const inputWorkbook = utils.book_new();
    const inputSheetData = [
      ['Name', 'Age'],
      ['John', '30'],
      ['Alice', '25'],
    ];
    const expectedOutput = inputSheetData;

    const worksheet = utils.aoa_to_sheet(inputSheetData);
    utils.book_append_sheet(inputWorkbook, worksheet, 'Sheet1');

    const result = mapWorkbook(inputWorkbook);

    expect(result).toEqual(expectedOutput);
  });

  it('should map the specified sheet of the workbook to a 2D array of strings', () => {
    const inputWorkbook = utils.book_new();
    const inputSheet1Data = [
      ['Name', 'Age'],
      ['John', '30'],
      ['Alice', '25'],
    ];
    const inputSheet2Data = [
      ['City', 'Population'],
      ['New York', '8500000'],
      ['Los Angeles', '4000000'],
    ];
    const expectedOutput = inputSheet2Data;

    const worksheet1 = utils.aoa_to_sheet(inputSheet1Data);
    const worksheet2 = utils.aoa_to_sheet(inputSheet2Data);
    utils.book_append_sheet(inputWorkbook, worksheet1, 'Sheet1');
    utils.book_append_sheet(inputWorkbook, worksheet2, 'Sheet2');

    const result = mapWorkbook(inputWorkbook, 'Sheet2');

    expect(result).toEqual(expectedOutput);
  });

  it('reads UTF-8 semicolon-delimited CSV saved by a localized spreadsheet', () => {
    const csv = '\uFEFFsep=;\r\nCompany;City\r\n"Crème, Inc.";Sfax';
    const workbook = read(new TextEncoder().encode(csv), {
      type: 'array',
      codepage: 65001,
      dense: true,
    });

    expect(mapWorkbook(workbook)).toEqual([
      ['Company', 'City'],
      ['Crème, Inc.', 'Sfax'],
    ]);
  });

  it('removes the Excel separator directive before column mapping', () => {
    const csv = '\uFEFFsep=,\r\nCompany,City\r\nAcme,Sfax';
    const workbook = read(new TextEncoder().encode(csv), {
      type: 'array',
      codepage: 65001,
      dense: true,
    });

    expect(mapWorkbook(workbook)).toEqual([
      ['Company', 'City'],
      ['Acme', 'Sfax'],
    ]);
  });

  it('reads raw Excel numbers and dates without locale display formatting', () => {
    const workbook = utils.book_new();
    const worksheet = utils.aoa_to_sheet([
      ['Amount', 'Created On'],
      [1234.56, new Date('2025-02-03T00:00:00.000Z')],
    ]);
    const amountCell = worksheet.A2;

    if (amountCell) {
      amountCell.z = '$#,##0.00';
      amountCell.t = 'n';
    }

    const dateCell = worksheet.B2;

    if (dateCell) {
      dateCell.v = new Date('2025-02-03T00:00:00.000Z');
      dateCell.t = 'd';
    }

    utils.book_append_sheet(workbook, worksheet, 'Sheet1');

    expect(mapWorkbook(workbook)).toEqual([
      ['Amount', 'Created On'],
      ['1234.56', '2025-02-03T00:00:00.000Z'],
    ]);
  });
});
