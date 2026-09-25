import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';
import { useLingui } from '@lingui/react/macro';
import { useLocation } from 'react-router-dom';
import { AppPath, CoreObjectNameSingular } from 'twenty-shared/types';
import { IconCalendarEvent } from 'twenty-ui/icon';

export const CalendarNavigationDrawerItem = () => {
  const { t } = useLingui();
  const { pathname } = useLocation();
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: CoreObjectNameSingular.CalendarEvent,
  });
  const { canReadObjectRecords } = useObjectPermissionsForObject(
    objectMetadataItem.id,
  );

  if (!canReadObjectRecords) {
    return null;
  }

  return (
    <NavigationDrawerItem
      active={pathname === AppPath.CalendarPage}
      Icon={IconCalendarEvent}
      label={t`Calendar`}
      to={AppPath.CalendarPage}
    />
  );
};
