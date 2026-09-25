import { ApolloLink, type Operation } from '@apollo/client';
import { GraphQLError } from 'graphql';
import { of, throwError } from 'rxjs';

import { createCaptchaRefreshLink } from '@/apollo/utils/captchaRefreshLink';

describe('createCaptchaRefreshLink', () => {
  it('runs token lifecycle cleanup after a guarded response completes', () => {
    const requestFreshCaptchaToken = jest.fn();
    const link = createCaptchaRefreshLink(requestFreshCaptchaToken);
    const operation = {
      variables: { captchaToken: 'single-use-response' },
    } as unknown as Operation;

    link.request(operation, () => of({ data: { success: true } }))?.subscribe();

    expect(requestFreshCaptchaToken).toHaveBeenCalledTimes(1);
  });

  it('runs token lifecycle cleanup after a guarded network error', () => {
    const requestFreshCaptchaToken = jest.fn();
    const link = createCaptchaRefreshLink(requestFreshCaptchaToken);
    const operation = {
      variables: { captchaToken: 'single-use-response' },
    } as unknown as Operation;

    link
      .request(operation, () => throwError(() => new Error('network failure')))
      ?.subscribe({ error: jest.fn() });

    expect(requestFreshCaptchaToken).toHaveBeenCalledTimes(1);
    expect(requestFreshCaptchaToken).toHaveBeenCalledWith({
      isRequestFailure: true,
    });
  });

  it('runs token lifecycle cleanup after a GraphQL authentication rejection', () => {
    const requestFreshCaptchaToken = jest.fn();
    const link = createCaptchaRefreshLink(requestFreshCaptchaToken);
    const operation = {
      variables: { captchaToken: 'single-use-response' },
    } as unknown as Operation;

    link
      .request(operation, () =>
        of({ errors: [new GraphQLError('Invalid CAPTCHA')] }),
      )
      ?.subscribe();

    expect(requestFreshCaptchaToken).toHaveBeenCalledTimes(1);
    expect(requestFreshCaptchaToken).toHaveBeenCalledWith({
      isRequestFailure: false,
    });
  });

  it('does not refresh for operations without CAPTCHA variables', () => {
    const requestFreshCaptchaToken = jest.fn();
    const link = createCaptchaRefreshLink(requestFreshCaptchaToken);
    const operation = { variables: {} } as unknown as Operation;

    link.request(operation, () => of({ data: { success: true } }))?.subscribe();

    expect(requestFreshCaptchaToken).not.toHaveBeenCalled();
  });

  it('prevents Apollo from retrying a single-use v2 response token', () => {
    const requestFreshCaptchaToken = jest.fn();
    const setContext = jest.fn();
    let isV2Checkbox = false;
    const link = createCaptchaRefreshLink(
      requestFreshCaptchaToken,
      () => isV2Checkbox,
    );
    isV2Checkbox = true;
    const operation = {
      variables: { captchaToken: 'single-use-response' },
      setContext,
    } as unknown as Operation;

    link.request(operation, () => of({ data: { success: true } }))?.subscribe();

    expect(setContext).toHaveBeenCalledWith({ skipRetry: true });
  });
});
