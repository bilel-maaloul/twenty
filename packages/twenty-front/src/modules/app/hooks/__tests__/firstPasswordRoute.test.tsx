import { renderHook } from '@testing-library/react';
import { isValidElement } from 'react';
import { type RouteObject } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';

import { useCreateRootAppRouter } from '@/app/hooks/useCreateRootAppRouter';
import { useCreateWorkspaceAppRouter } from '@/app/hooks/useCreateWorkspaceAppRouter';
import { AuthFlowLayout } from '@/ui/layout/page/components/AuthFlowLayout';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  createBrowserRouter: (routes: RouteObject[]) => ({ routes }),
}));

const findAuthLayout = (routes: RouteObject[]): RouteObject | undefined => {
  for (const route of routes) {
    if (
      isValidElement(route.element) &&
      route.element.type === AuthFlowLayout
    ) {
      return route;
    }

    const nested = findAuthLayout(route.children ?? []);

    if (nested) {
      return nested;
    }
  }

  return undefined;
};

describe('first-password auth route', () => {
  it('is available under the root auth layout', () => {
    const { result } = renderHook(() => useCreateRootAppRouter());
    const authLayout = findAuthLayout(result.current.routes);

    expect(
      authLayout?.children?.some(
        (route) => route.path === AppPath.CreateFirstPassword,
      ),
    ).toBe(true);
  });

  it('is available under the workspace auth layout', () => {
    const { result } = renderHook(() => useCreateWorkspaceAppRouter({}));
    const authLayout = findAuthLayout(result.current.routes);

    expect(
      authLayout?.children?.some(
        (route) => route.path === AppPath.CreateFirstPassword,
      ),
    ).toBe(true);
  });
});
