import { getSpreadSheetFieldValidationDefinitions } from '@/object-record/spreadsheet-import/utils/getSpreadSheetFieldValidationDefinitions';
import { FieldMetadataType } from '~/generated-metadata/graphql';

describe('getSpreadSheetFieldValidationDefinitions', () => {
  it('validates finite spreadsheet numbers and localized decimals', () => {
    const [numberValidation] = getSpreadSheetFieldValidationDefinitions(
      FieldMetadataType.NUMBER,
      'Amount',
    );

    if (numberValidation.rule !== 'function') {
      throw new Error('Expected number validation to be a function rule');
    }

    expect(numberValidation.isValid('1.234,56')).toBe(true);
    expect(numberValidation.isValid('Infinity')).toBe(false);
    expect(numberValidation.isValid('1,234')).toBe(false);
  });

  it('validates currency codes without regard to case', () => {
    const [currencyCodeValidation] = getSpreadSheetFieldValidationDefinitions(
      FieldMetadataType.CURRENCY,
      'Currency',
      'currencyCode',
    );

    if (currencyCodeValidation.rule !== 'function') {
      throw new Error(
        'Expected currency code validation to be a function rule',
      );
    }

    expect(currencyCodeValidation.isValid('usd')).toBe(true);
    expect(currencyCodeValidation.isValid('XXX')).toBe(false);
  });
});
