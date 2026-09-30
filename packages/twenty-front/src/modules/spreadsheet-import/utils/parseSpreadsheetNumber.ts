const isDigitSequence = (value: string) => /^\d+$/.test(value);

const parseMantissa = (value: string, decimalSeparator?: ',' | '.') => {
  const decimalIndex = isDefinedDecimalSeparator(decimalSeparator)
    ? value.lastIndexOf(decimalSeparator)
    : -1;
  const integerPart =
    decimalIndex >= 0 ? value.slice(0, decimalIndex) || '0' : value;
  const decimalPart = decimalIndex >= 0 ? value.slice(decimalIndex + 1) : '';

  if (
    decimalIndex >= 0 &&
    decimalPart !== '' &&
    !isDigitSequence(decimalPart)
  ) {
    return undefined;
  }

  const integerGroups = integerPart.split(/[,. '\u00a0\u202f\u2019]/);

  if (
    integerGroups.some((group) => !isDigitSequence(group)) ||
    (integerGroups.length > 1 &&
      (integerGroups[0].length < 1 ||
        integerGroups[0].length > 3 ||
        integerGroups.slice(1).some((group) => group.length !== 3)))
  ) {
    return undefined;
  }

  const integerDigits = integerGroups.join('');
  const normalized =
    decimalIndex >= 0 && decimalPart !== ''
      ? `${integerDigits}.${decimalPart}`
      : integerDigits;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : undefined;
};

const isDefinedDecimalSeparator = (
  value: ',' | '.' | undefined,
): value is ',' | '.' => value === ',' || value === '.';

export const parseSpreadsheetNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (trimmedValue === '') {
    return undefined;
  }

  const sign = trimmedValue.startsWith('-') ? '-' : '';
  const unsignedValue = trimmedValue.replace(/^[+-]/, '');
  const exponentMatch = unsignedValue.match(/^(.+?)([eE][+-]?\d+)$/);
  const mantissa = exponentMatch?.[1] ?? unsignedValue;
  const exponent = exponentMatch?.[2] ?? '';

  if (
    !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(mantissa) &&
    !/[,. '\u00a0\u202f\u2019]/.test(mantissa)
  ) {
    return undefined;
  }

  const hasRepeatedDecimalCandidate = [',', '.'].some((separator) => {
    const separatorCount = [...mantissa].filter(
      (character) => character === separator,
    ).length;

    return separatorCount > 1;
  });

  const candidateValues = new Set<number>();

  for (const decimalSeparator of [undefined, ',', '.'] as const) {
    if (hasRepeatedDecimalCandidate && decimalSeparator) {
      const groups = mantissa.split(decimalSeparator);

      if (groups.slice(1).every((group) => group.length === 3)) {
        continue;
      }
    }

    const parsedMantissa = parseMantissa(mantissa, decimalSeparator);

    if (
      !isDefinedDecimalSeparator(decimalSeparator) &&
      parsedMantissa === undefined
    ) {
      continue;
    }

    if (parsedMantissa === undefined) {
      continue;
    }

    const parsedValue = Number(`${sign}${parsedMantissa}${exponent}`);

    if (Number.isFinite(parsedValue)) {
      candidateValues.add(parsedValue);
    }
  }

  if (candidateValues.size !== 1) {
    return undefined;
  }

  return [...candidateValues][0];
};
