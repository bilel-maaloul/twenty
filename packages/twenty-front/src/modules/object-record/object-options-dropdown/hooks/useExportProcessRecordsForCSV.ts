import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { getLabelIdentifierFieldMetadataItem } from '@/object-metadata/utils/getLabelIdentifierFieldMetadataItem';
import { getLabelIdentifierFieldValue } from '@/object-metadata/utils/getLabelIdentifierFieldValue';
import { type FieldCurrencyValue } from '@/object-record/record-field/ui/types/FieldMetadata';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { formatAdditionalPhonesForCSV } from '@/spreadsheet-import/utils/formatAdditionalPhonesForCSV';
import { formatLinksForCSV } from '@/spreadsheet-import/utils/formatLinksForCSV';
import {
  formatStringArrayForCSV,
  formatDateTimeForCSV,
  parseStringArrayFromCSV,
} from '@/spreadsheet-import/utils/spreadsheetValueFormats';
import { isDefined } from 'twenty-shared/utils';
import { FieldMetadataType } from '~/generated-metadata/graphql';
import { convertCurrencyMicrosToCurrencyAmount } from '~/utils/convertCurrencyToCurrencyMicros';

export const useExportProcessRecordsForCSV = (objectNameSingular: string) => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });
  const { objectMetadataItems } = useObjectMetadataItems();

  const processRecordsForCSVExport = (records: ObjectRecord[]) => {
    return records.map((record) =>
      objectMetadataItem.fields.reduce(
        (processedRecord, field) => {
          if (!isDefined(record[field.name])) {
            return processedRecord;
          }

          switch (field.type) {
            case FieldMetadataType.RELATION: {
              const relationRecord = record[field.name];
              const targetObjectMetadataItem = objectMetadataItems.find(
                (metadataItem) =>
                  metadataItem.id === field.relation?.targetObjectMetadata.id,
              );
              const labelIdentifierFieldMetadataItem = targetObjectMetadataItem
                ? getLabelIdentifierFieldMetadataItem(targetObjectMetadataItem)
                : undefined;
              const relationLabel =
                typeof relationRecord === 'object' &&
                relationRecord !== null &&
                targetObjectMetadataItem &&
                labelIdentifierFieldMetadataItem
                  ? getLabelIdentifierFieldValue(
                      relationRecord as ObjectRecord,
                      labelIdentifierFieldMetadataItem,
                    )
                  : '';
              const relationId =
                record[`${field.name}Id`] ?? relationRecord?.id;

              return {
                ...processedRecord,
                [field.name]: relationLabel,
                [`${field.name}Id`]: relationId,
              };
            }
            case FieldMetadataType.ACTOR: {
              const actorValue = record[field.name];

              return {
                ...processedRecord,
                [field.name]:
                  typeof actorValue === 'object' && actorValue !== null
                    ? (actorValue.name ?? '')
                    : '',
              };
            }
            case FieldMetadataType.CURRENCY:
              return {
                ...processedRecord,
                [field.name]: {
                  amountMicros: convertCurrencyMicrosToCurrencyAmount(
                    record[field.name].amountMicros,
                  ),
                  currencyCode: record[field.name].currencyCode,
                } satisfies FieldCurrencyValue,
              };
            case FieldMetadataType.SELECT: {
              const selectedOption = field.options?.find(
                (option) => option.value === record[field.name],
              );

              return {
                ...processedRecord,
                [field.name]: selectedOption?.label ?? record[field.name],
              };
            }
            case FieldMetadataType.MULTI_SELECT: {
              const values = parseStringArrayFromCSV(record[field.name]);
              const optionLabels = values.map(
                (value) =>
                  field.options?.find((option) => option.value === value)
                    ?.label ?? value,
              );

              return {
                ...processedRecord,
                [field.name]: formatStringArrayForCSV(optionLabels),
              };
            }
            case FieldMetadataType.ARRAY:
              return {
                ...processedRecord,
                [field.name]: formatStringArrayForCSV(
                  parseStringArrayFromCSV(record[field.name]),
                ),
              };
            case FieldMetadataType.RAW_JSON:
              return {
                ...processedRecord,
                [field.name]: JSON.stringify(record[field.name]),
              };
            case FieldMetadataType.FILES: {
              const files = record[field.name];
              const fileLabels = Array.isArray(files)
                ? files.flatMap((file) =>
                    typeof file?.label === 'string' ? [file.label] : [],
                  )
                : [];

              return {
                ...processedRecord,
                [field.name]: formatStringArrayForCSV(fileLabels),
              };
            }
            case FieldMetadataType.EMAILS:
              return {
                ...processedRecord,
                [field.name]: {
                  ...record[field.name],
                  additionalEmails: formatStringArrayForCSV(
                    isDefined(record[field.name].additionalEmails)
                      ? parseStringArrayFromCSV(
                          record[field.name].additionalEmails,
                        )
                      : [],
                  ),
                },
              };
            case FieldMetadataType.LINKS:
              return {
                ...processedRecord,
                [field.name]: {
                  ...record[field.name],
                  secondaryLinks: Array.isArray(
                    record[field.name].secondaryLinks,
                  )
                    ? formatLinksForCSV(record[field.name].secondaryLinks)
                    : record[field.name].secondaryLinks,
                },
              };
            case FieldMetadataType.PHONES:
              return {
                ...processedRecord,
                [field.name]: {
                  ...record[field.name],
                  additionalPhones: Array.isArray(
                    record[field.name].additionalPhones,
                  )
                    ? formatAdditionalPhonesForCSV(
                        record[field.name].additionalPhones,
                      )
                    : record[field.name].additionalPhones,
                },
              };
            case FieldMetadataType.DATE_TIME:
              return {
                ...processedRecord,
                [field.name]: formatDateTimeForCSV(String(record[field.name])),
              };
            case FieldMetadataType.DATE:
              return {
                ...processedRecord,
                [field.name]: String(record[field.name]).slice(0, 10),
              };
            default:
              return processedRecord;
          }
        },
        { ...record },
      ),
    );
  };

  return { processRecordsForCSVExport };
};
