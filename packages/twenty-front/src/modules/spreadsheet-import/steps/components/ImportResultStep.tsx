import { StepNavigationButton } from '@/spreadsheet-import/components/StepNavigationButton';
import { useSpreadsheetImportInternal } from '@/spreadsheet-import/hooks/useSpreadsheetImportInternal';
import { type SpreadsheetImportSubmissionResult } from '@/spreadsheet-import/types';
import { getSpreadsheetImportSubmissionOutcome } from '@/spreadsheet-import/utils/getSpreadsheetImportOutcome';
import { useNumberFormat } from '@/localization/hooks/useNumberFormat';
import { Trans, useLingui } from '@lingui/react/macro';
import { styled } from '@linaria/react';
import { ModalContent } from 'twenty-ui/surfaces';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledResult = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  margin: auto;
  max-width: 520px;
  padding: ${themeCssVariables.spacing[8]};
  width: 100%;
`;

const StyledTitle = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xl};
  margin: 0;
`;

const StyledCounts = styled.dl`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: 1fr auto;
  margin: 0;
`;

const StyledCountLabel = styled.dt`
  color: ${themeCssVariables.font.color.secondary};
`;

const StyledCount = styled.dd`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledMessage = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  margin: 0;
`;

const StyledIssues = styled.ol`
  color: ${themeCssVariables.font.color.secondary};
  margin: 0;
  max-height: 180px;
  overflow: auto;
`;

export const ImportResultStep = ({
  result,
}: {
  result: SpreadsheetImportSubmissionResult;
}) => {
  const { onClose } = useSpreadsheetImportInternal();
  const { formatNumber } = useNumberFormat();
  const { t } = useLingui();
  const nothingWritten = result.created === 0 && result.updated === 0;
  const outcome = getSpreadsheetImportSubmissionOutcome(result);
  const nothingNewToImport = outcome === 'NOTHING_TO_IMPORT';
  const title =
    outcome === 'IMPORT_FAILED'
      ? t`Something went wrong`
      : nothingNewToImport
        ? t`Nothing new to import`
        : outcome === 'IMPORT_PARTIALLY_SUCCEEDED'
          ? t`Import completed with problems`
          : t`Import completed`;

  return (
    <>
      <ModalContent noPadding isVerticallyCentered isHorizontallyCentered>
        <StyledResult role="status" aria-live="polite">
          <StyledTitle>{title}</StyledTitle>
          <StyledCounts>
            <StyledCountLabel>
              <Trans>Created</Trans>
            </StyledCountLabel>
            <StyledCount>{formatNumber(result.created)}</StyledCount>
            <StyledCountLabel>
              <Trans>Updated</Trans>
            </StyledCountLabel>
            <StyledCount>{formatNumber(result.updated)}</StyledCount>
            <StyledCountLabel>
              <Trans>Skipped — already existed</Trans>
            </StyledCountLabel>
            <StyledCount>{formatNumber(result.skippedExisting)}</StyledCount>
            <StyledCountLabel>
              <Trans>Skipped — existing values preserved</Trans>
            </StyledCountLabel>
            <StyledCount>{formatNumber(result.skippedPreserved)}</StyledCount>
            <StyledCountLabel>
              <Trans>Skipped — duplicate-group decision</Trans>
            </StyledCountLabel>
            <StyledCount>
              {formatNumber(result.skippedDuplicateRows)}
            </StyledCount>
            <StyledCountLabel>
              <Trans>Skipped — chosen by you</Trans>
            </StyledCountLabel>
            <StyledCount>{formatNumber(result.skippedManually)}</StyledCount>
            <StyledCountLabel>
              <Trans>Not imported — invalid or unresolved</Trans>
            </StyledCountLabel>
            <StyledCount>{formatNumber(result.notImported)}</StyledCount>
            <StyledCountLabel>
              <Trans>Failed writes</Trans>
            </StyledCountLabel>
            <StyledCount>{formatNumber(result.failed)}</StyledCount>
          </StyledCounts>
          <StyledMessage>
            {result.outcome === 'NOTHING_TO_IMPORT'
              ? t`All ${formatNumber(result.totalRows)} records already exist in the CRM with the same data. No new records were created and no existing records needed an update.`
              : nothingWritten && result.failed === 0
                ? t`Your CRM was not changed.`
                : t`${formatNumber(result.totalRows)} rows were analyzed.`}
          </StyledMessage>
          {result.status === 'failed' && (
            <StyledMessage>
              <Trans>
                We couldn't complete the import. Try again or review the
                affected records.
              </Trans>
            </StyledMessage>
          )}
          {result.ignoredFieldValues &&
            result.ignoredFieldValues.length > 0 && (
              <>
                <StyledMessage>
                  {t`${result.ignoredFieldValues.length} invalid field values were ignored and not imported.`}
                </StyledMessage>
                <StyledIssues>
                  {result.ignoredFieldValues.map((issue) => (
                    <li key={`${issue.rowNumber}-${issue.fieldLabel}`}>
                      {t`Row ${issue.rowNumber}`}
                      {issue.recordLabel
                        ? ` â€” ${issue.recordLabel}`
                        : ''}: {issue.fieldLabel}{' '}
                      {t`was ignored. Incoming value:`} {issue.incomingValue}.{' '}
                      {issue.reason}
                    </li>
                  ))}
                </StyledIssues>
              </>
            )}
          {result.skippedManuallyRowNumbers &&
            result.skippedManuallyRowNumbers.length > 0 && (
              <>
                <StyledMessage>
                  <Trans>Skipped by your decision</Trans>
                </StyledMessage>
                <StyledIssues>
                  {result.skippedManuallyRowNumbers.map((rowNumber) => (
                    <li key={rowNumber}>
                      <Trans>Uploaded row {rowNumber} was skipped.</Trans>
                    </li>
                  ))}
                </StyledIssues>
              </>
            )}
          {result.errorMessage && (
            <StyledMessage>{result.errorMessage}</StyledMessage>
          )}
          {result.preservationMessages?.map((message) => (
            <StyledMessage key={message}>{message}</StyledMessage>
          ))}
          {result.skippedDuplicateRowNumbers &&
            result.skippedDuplicateRowNumbers.length > 0 && (
              <>
                <StyledMessage>
                  <Trans>Skipped by duplicate-group decision</Trans>
                </StyledMessage>
                <StyledIssues>
                  {result.skippedDuplicateRowNumbers.map((rowNumber) => (
                    <li key={rowNumber}>
                      <Trans>Uploaded row {rowNumber} was skipped.</Trans>
                    </li>
                  ))}
                </StyledIssues>
              </>
            )}
          {result.rowIssues && result.rowIssues.length > 0 && (
            <>
              <StyledMessage>
                <Trans>Rows that need review</Trans>
              </StyledMessage>
              <StyledIssues>
                {result.rowIssues.slice(0, 20).map((issue) => (
                  <li key={`${issue.rowNumber}-${issue.message}`}>
                    <Trans>Row {issue.rowNumber}:</Trans> {issue.message}
                  </li>
                ))}
              </StyledIssues>
              {result.rowIssues.length > 20 && (
                <StyledMessage>
                  <Trans>
                    And {result.rowIssues.length - 20} more row issues.
                  </Trans>
                </StyledMessage>
              )}
            </>
          )}
          {nothingWritten && result.updated === 0 && result.failed > 0 && (
            <StyledMessage>
              <Trans>
                No records were imported. Review the rows and try again.
              </Trans>
            </StyledMessage>
          )}
        </StyledResult>
      </ModalContent>
      <StepNavigationButton
        onBack={onClose}
        backTitle={t`Done — view records`}
        isContinueDisabled
      />
    </>
  );
};
