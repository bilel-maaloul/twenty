import { ModalStatefulWrapper } from '@/ui/layout/modal/components/ModalStatefulWrapper';
import { useModal } from '@/ui/layout/modal/hooks/useModal';
import { type SpreadsheetExportFormat } from '@/spreadsheet/types/SpreadsheetExportFormat';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import { Button } from 'twenty-ui/input';
import { IconFileExport, IconFileText } from 'twenty-ui/icon';
import { ModalContent, ModalFooter, ModalHeader } from 'twenty-ui/surfaces';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledTitle = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledDescription = styled.p`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  margin: 0;
`;

const StyledButtonGroup = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  width: 100%;
`;

type ExportFormatPickerProps = {
  modalInstanceId: string;
  onCancel: () => void;
  onSelect: (format: SpreadsheetExportFormat) => void;
};

export const ExportFormatPicker = ({
  modalInstanceId,
  onCancel,
  onSelect,
}: ExportFormatPickerProps) => {
  const { closeModal, openModal } = useModal();

  useEffect(() => {
    openModal(modalInstanceId);

    return () => closeModal(modalInstanceId);
  }, [closeModal, modalInstanceId, openModal]);

  const handleSelect = (format: SpreadsheetExportFormat) => {
    closeModal(modalInstanceId);
    onSelect(format);
  };

  return (
    <ModalStatefulWrapper
      modalInstanceId={modalInstanceId}
      isClosable
      size="small"
      onClose={onCancel}
    >
      <ModalHeader>
        <StyledTitle>{t`Export records`}</StyledTitle>
      </ModalHeader>
      <ModalContent gap={4}>
        <StyledDescription>{t`Choose a file format`}</StyledDescription>
      </ModalContent>
      <ModalFooter>
        <StyledButtonGroup>
          <Button
            Icon={IconFileExport}
            fullWidth
            onClick={() => handleSelect('xlsx')}
            title={t`Excel (.xlsx)`}
          />
          <Button
            Icon={IconFileText}
            fullWidth
            onClick={() => handleSelect('csv')}
            title={t`CSV (.csv)`}
            variant="secondary"
          />
        </StyledButtonGroup>
      </ModalFooter>
    </ModalStatefulWrapper>
  );
};
