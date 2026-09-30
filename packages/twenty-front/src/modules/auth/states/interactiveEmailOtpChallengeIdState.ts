import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const interactiveEmailOtpChallengeIdState = createAtomState<
  string | null
>({
  key: 'interactiveEmailOtpChallengeIdState',
  defaultValue: null,
});
