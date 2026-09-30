import {
  formatLinksForCSV,
  parseLinksFromCSV,
} from '@/spreadsheet-import/utils/formatLinksForCSV';

describe('formatLinksForCSV', () => {
  it('formats links as readable lines and restores escaped labels', () => {
    const links = [
      { label: 'Product: docs', url: 'https://example.com/docs' },
      {
        label: 'Second line\nwith a slash \\',
        url: 'https://example.com/help',
      },
    ];

    const formatted = formatLinksForCSV(links);

    expect(formatted).toContain('Product\\: docs: https://example.com/docs');
    expect(formatted).not.toContain('[{"label"');
    expect(parseLinksFromCSV(formatted)).toEqual(links);
  });

  it('continues to parse link arrays from existing CSV exports', () => {
    expect(
      parseLinksFromCSV('[{"label":"Docs","url":"https://example.com/docs"}]'),
    ).toEqual([{ label: 'Docs', url: 'https://example.com/docs' }]);
  });

  it('rejects malformed readable link lines', () => {
    expect(() => parseLinksFromCSV('not a link')).toThrow('Invalid link line');
  });
});
