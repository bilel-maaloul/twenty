import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { isHiddenSystemField } from '@/object-metadata/utils/isHiddenSystemField';
import { type RecordField } from '@/object-record/record-field/types/RecordField';

type SpreadsheetExportRecordField = Pick<
  RecordField,
  'fieldMetadataItemId' | 'isVisible' | 'position'
>;

type SpreadsheetExportObjectMetadata = Pick<
  EnrichedObjectMetadataItem,
  'fields' | 'readableFields'
>;

type GetSpreadsheetExportFieldMetadataItemsArgs = {
  objectMetadataItem: SpreadsheetExportObjectMetadata;
  recordFields?: SpreadsheetExportRecordField[];
};

export const getSpreadsheetExportFieldMetadataItems = ({
  objectMetadataItem,
  recordFields,
}: GetSpreadsheetExportFieldMetadataItemsArgs): FieldMetadataItem[] => {
  if (recordFields !== undefined) {
    const readableFieldMetadataIds = new Set(
      objectMetadataItem.readableFields.map(
        (fieldMetadataItem) => fieldMetadataItem.id,
      ),
    );

    return recordFields
      .filter(
        (recordField) =>
          recordField.isVisible &&
          readableFieldMetadataIds.has(recordField.fieldMetadataItemId),
      )
      .toSorted(
        (recordFieldA, recordFieldB) =>
          recordFieldA.position - recordFieldB.position,
      )
      .map((recordField) =>
        objectMetadataItem.fields.find(
          (fieldMetadataItem) =>
            fieldMetadataItem.id === recordField.fieldMetadataItemId,
        ),
      )
      .filter(
        (fieldMetadataItem): fieldMetadataItem is FieldMetadataItem =>
          fieldMetadataItem !== undefined,
      )
      .filter(
        (fieldMetadataItem) =>
          fieldMetadataItem.isActive !== false &&
          !isHiddenSystemField(fieldMetadataItem),
      );
  }

  return objectMetadataItem.readableFields.filter(
    (fieldMetadataItem) =>
      fieldMetadataItem.isActive !== false &&
      fieldMetadataItem.isSystem !== true,
  );
};
