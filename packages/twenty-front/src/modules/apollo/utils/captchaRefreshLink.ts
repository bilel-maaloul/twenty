import { ApolloLink } from '@apollo/client';
import { catchError, finalize, map, throwError } from 'rxjs';

type CaptchaRequestLifecycleOptions = {
  isRequestFailure?: boolean;
};

type IsV2Checkbox = () => boolean;

export const createCaptchaRefreshLink = (
  requestFreshCaptchaToken: (options?: CaptchaRequestLifecycleOptions) => void,
  isV2Checkbox: IsV2Checkbox = () => false,
) => {
  return new ApolloLink((operation, forward) => {
    const { variables } = operation;

    const hasCaptchaToken = variables != null && 'captchaToken' in variables;
    let didHandleRequest = false;

    if (hasCaptchaToken && isV2Checkbox()) {
      operation.setContext({ skipRetry: true });
    }

    const handleRequest = (isRequestFailure: boolean) => {
      if (!hasCaptchaToken || didHandleRequest) {
        return;
      }

      didHandleRequest = true;
      requestFreshCaptchaToken({ isRequestFailure });
    };

    return forward(operation).pipe(
      map((result) => {
        handleRequest(false);
        return result;
      }),
      catchError((error: unknown) => {
        handleRequest(true);
        return throwError(() => error);
      }),
      finalize(() => {
        handleRequest(true);
      }),
    );
  });
};
