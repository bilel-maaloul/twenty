import { ApolloLink, gql, Observable, type ApolloClient } from '@apollo/client';

import { loggerLink } from '@/apollo/utils/loggerLink';
import { logDebug } from '~/utils/logDebug';

jest.mock('~/utils/logDebug', () => ({ logDebug: jest.fn() }));
jest.mock('twenty-shared/utils', () => ({
  isDefined: (value: unknown) => value !== undefined && value !== null,
}));

const execute = (
  variables: Record<string, unknown>,
  resultData: Record<string, unknown> = { createFirstPassword: true },
  headers?: Record<string, string>,
) =>
  new Promise<void>((resolve, reject) => {
    ApolloLink.execute(
      ApolloLink.from([
        loggerLink(() => 'metadata'),
        new ApolloLink(
          () =>
            new Observable((observer) => {
              observer.next({ data: resultData });
              observer.complete();
            }),
        ),
      ]),
      {
        query: gql`
          mutation CreateFirstPassword(
            $newPassword: String!
            $confirmPassword: String!
          ) {
            createFirstPassword(
              newPassword: $newPassword
              confirmPassword: $confirmPassword
            )
          }
        `,
        variables,
      },
      {
        client: {} as ApolloClient,
        headers,
      } as Parameters<typeof ApolloLink.execute>[2],
    ).subscribe({ complete: resolve, error: reject });
  });

describe('loggerLink password protection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not log first-password values', async () => {
    await execute({
      newPassword: 'NewSecretPassword',
      confirmPassword: 'NewSecretPassword',
    });

    expect(logDebug).not.toHaveBeenCalled();
  });

  it('does not log nested password values', async () => {
    await execute({ input: { password: 'NestedSecretPassword' } });

    expect(logDebug).not.toHaveBeenCalled();
  });

  it.each([
    'captchaToken',
    'emailVerificationToken',
    'workspacePersonalInviteToken',
    'ssoExchangeToken',
    'refreshToken',
    'oneTimePassword',
    'passcode',
    'firstPasswordCapability',
  ])('does not log values under %s', async (tokenName) => {
    await execute({ [tokenName]: 'single-use-secret-value' });

    expect(logDebug).not.toHaveBeenCalled();
  });

  it('does not log token-bearing results', async () => {
    await execute(
      { email: 'person@example.com' },
      {
        verifyEmailAndGetLoginToken: {
          loginToken: 'issued-auth-token',
        },
      },
    );

    expect(logDebug).not.toHaveBeenCalledWith('RESULT', expect.anything());
  });

  it('does not log request headers', async () => {
    await execute(
      { email: 'person@example.com' },
      { checkUserExists: { exists: true } },
      { authorization: 'Bearer issued-auth-token' },
    );

    expect(logDebug).not.toHaveBeenCalledWith('HEADERS: ', expect.anything());
  });
});
