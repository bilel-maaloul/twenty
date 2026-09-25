import { ApolloLink, gql, Observable, type ApolloClient } from '@apollo/client';

import { loggerLink } from '@/apollo/utils/loggerLink';
import { logDebug } from '~/utils/logDebug';

jest.mock('~/utils/logDebug', () => ({ logDebug: jest.fn() }));

const execute = (variables: Record<string, unknown>) =>
  new Promise<void>((resolve, reject) => {
    ApolloLink.execute(
      ApolloLink.from([
        loggerLink(() => 'metadata'),
        new ApolloLink(
          () =>
            new Observable((observer) => {
              observer.next({ data: { createFirstPassword: true } });
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
      { client: {} as ApolloClient },
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

  it('does not log CAPTCHA response tokens', async () => {
    await execute({ captchaToken: 'single-use-captcha-response' });

    expect(logDebug).not.toHaveBeenCalled();
  });
});
