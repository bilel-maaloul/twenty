export type SpreadsheetLink = {
  label: string | null;
  url: string | null;
};

const escapeLinkPart = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');

const escapeLinkUrl = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n');

const unescapeLinkPart = (value: string) =>
  value.replace(/\\([\\:rn])/g, (_, escapedCharacter: string) => {
    switch (escapedCharacter) {
      case 'r':
        return '\r';
      case 'n':
        return '\n';
      default:
        return escapedCharacter;
    }
  });

const findLinkSeparator = (line: string) => {
  for (let index = 0; index < line.length; index++) {
    if (line[index] === '\\') {
      index++;
      continue;
    }

    if (line[index] === ':' && line[index + 1] === ' ') {
      return index;
    }
  }

  return -1;
};

export const formatLinksForCSV = (links: SpreadsheetLink[]) =>
  links
    .filter(({ label, url }) => Boolean(label || url))
    .map(
      ({ label, url }) =>
        `${escapeLinkPart(label ?? '')}: ${escapeLinkUrl(url ?? '')}`,
    )
    .join('\n');

export const parseLinksFromCSV = (value: unknown): SpreadsheetLink[] => {
  if (typeof value !== 'string') {
    throw new Error('Links must be text');
  }

  if (value.trim() === '') {
    return [];
  }

  try {
    const parsedValue: unknown = JSON.parse(value);

    if (Array.isArray(parsedValue)) {
      return parsedValue.map((link) => {
        if (
          typeof link !== 'object' ||
          link === null ||
          !('url' in link) ||
          !('label' in link) ||
          (link.url !== null && typeof link.url !== 'string') ||
          (link.label !== null && typeof link.label !== 'string')
        ) {
          throw new Error('Invalid link');
        }

        return {
          label: link.label,
          url: link.url,
        };
      });
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      // The line format keeps exported link lists readable in spreadsheets.
    } else {
      throw error;
    }
  }

  return value.split(/\r?\n/).map((line) => {
    const separatorIndex = findLinkSeparator(line);

    if (separatorIndex === -1) {
      throw new Error('Invalid link line');
    }

    const label = unescapeLinkPart(line.slice(0, separatorIndex));
    const url = unescapeLinkPart(line.slice(separatorIndex + 2));

    return {
      label: label === '' ? null : label,
      url: url === '' ? null : url,
    };
  });
};
