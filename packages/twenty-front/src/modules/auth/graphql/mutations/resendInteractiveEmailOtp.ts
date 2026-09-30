import { gql } from '@apollo/client';

export const RESEND_INTERACTIVE_EMAIL_OTP = gql`
  mutation ResendInteractiveEmailOtp($challengeId: String!) {
    resendInteractiveEmailOtp(challengeId: $challengeId)
  }
`;
