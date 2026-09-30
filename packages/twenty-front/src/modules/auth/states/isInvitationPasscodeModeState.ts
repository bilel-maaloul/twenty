import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const isInvitationPasscodeModeState = createAtomState<boolean>({
  key: 'isInvitationPasscodeModeState',
  defaultValue: false,
});
