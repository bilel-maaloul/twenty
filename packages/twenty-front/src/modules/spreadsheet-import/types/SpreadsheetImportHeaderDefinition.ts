export type SpreadsheetImportHeaderDefinitionKind = 'importable' | 'readOnly';

export type SpreadsheetImportHeaderDefinition = {
  header: string;
  fieldKey?: string;
  kind: SpreadsheetImportHeaderDefinitionKind;
};
