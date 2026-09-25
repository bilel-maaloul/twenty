import {
  GetAuthTokensFromLoginTokenDocument,
  GetCurrentUserDocument,
  GetLoginTokenFromCredentialsDocument,
  SignInDocument,
  SignUpDocument,
  SignUpInWorkspaceDocument,
} from '~/generated-metadata/graphql';

export const queries = {
  getLoginTokenFromCredentials: GetLoginTokenFromCredentialsDocument,
  signIn: SignInDocument,
  getAuthTokensFromLoginToken: GetAuthTokensFromLoginTokenDocument,
  signup: SignUpDocument,
  getCurrentUser: GetCurrentUserDocument,
  signUpInWorkspace: SignUpInWorkspaceDocument,
};

export const email = 'test@test.com';
export const password = 'testing';
export const origin = 'http://localhost';
export const token =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

export const variables = {
  getLoginTokenFromCredentials: {
    email,
    password,
    origin,
  },
  signIn: { email, password },
  getAuthTokensFromLoginToken: { loginToken: token, origin },
  signup: {
    email,
    password,
    workspacePersonalInviteToken: null,
    locale: 'en',
  },
  signUpInWorkspace: {
    email,
    password,
    workspacePersonalInviteToken: null,
    locale: 'en',
  },
  getCurrentUser: {},
};

export const results = {
  getLoginTokenFromCredentials: {
    __typename: 'LoginToken',
    requiresFirstPasswordCreation: false,
    loginToken: {
      __typename: 'AuthToken',
      token,
      expiresAt: '2022-01-01',
    } as { __typename: string; token: string; expiresAt: string } | null,
  },
  signIn: {
    __typename: 'AvailableWorkspacesAndAccessTokens',
    requiresFirstPasswordCreation: false,
    availableWorkspaces: {
      __typename: 'AvailableWorkspaces',
      availableWorkspacesForSignIn: [],
      availableWorkspacesForSignUp: [],
    } as {
      __typename: string;
      availableWorkspacesForSignIn: [];
      availableWorkspacesForSignUp: [];
    } | null,
    tokens: null,
  },
  getAuthTokensFromLoginToken: {
    tokens: {
      accessOrWorkspaceAgnosticToken: { token, expiresAt: 'expiresAt' },
      refreshToken: { token, expiresAt: 'expiresAt' },
    },
  },
  signUp: { loginToken: { token, expiresAt: 'expiresAt' } },
  signUpInWorkspace: {
    loginToken: { __typename: 'AuthToken', token, expiresAt: 'expiresAt' },
    workspace: {
      id: 'workspace-id',
      workspaceUrls: {
        subdomainUrl: 'https://subdomain.twenty.com',
        customUrl: 'https://custom.twenty.com',
      },
    },
  },
  getCurrentUser: {
    currentUser: {
      __typename: 'User',
      id: 'id',
      firstName: 'firstName',
      lastName: 'lastName',
      email: 'email',
      canAccessFullAdminPanel: false,
      canImpersonate: 'canImpersonate',
      supportUserHash: 'supportUserHash',
      workspaceMember: {
        id: 'id',
        name: {
          firstName: 'firstName',
          lastName: 'lastName',
        },
        colorScheme: 'colorScheme',
        avatarUrl: 'avatarUrl',
        locale: 'locale',
      },
      availableWorkspaces: {
        __typename: 'AvailableWorkspaces',
        availableWorkspacesForSignIn: [],
        availableWorkspacesForSignUp: [],
      },
      currentWorkspace: {
        id: 'id',
        displayName: 'displayName',
        logo: 'logo',
        inviteHash: 'inviteHash',
        allowImpersonation: true,
        subscriptionStatus: 'subscriptionStatus',
        customDomain: null,
        workspaceUrls: {
          customUrl: undefined,
          subdomainUrl: 'https://twenty.com',
        },
        featureFlags: {
          id: 'id',
          key: 'key',
          value: 'value',
          workspaceId: 'workspaceId',
        },
      },
    },
  },
};

export const mocks = {
  signIn: {
    request: { query: queries.signIn, variables: variables.signIn },
    result: jest.fn(() => ({ data: { signIn: results.signIn } })),
  },
  getLoginTokenFromCredentials: {
    request: {
      query: queries.getLoginTokenFromCredentials,
      variables: variables.getLoginTokenFromCredentials,
    },
    result: jest.fn(() => ({
      data: {
        getLoginTokenFromCredentials: results.getLoginTokenFromCredentials,
      },
    })),
  },
  getAuthTokensFromLoginToken: {
    request: {
      query: queries.getAuthTokensFromLoginToken,
      variables: variables.getAuthTokensFromLoginToken,
    },
    result: jest.fn(() => ({
      data: {
        getAuthTokensFromLoginToken: results.getAuthTokensFromLoginToken,
      },
    })),
  },
  signup: {
    request: {
      query: queries.signup,
      variables: variables.signup,
    },
    result: jest.fn(() => ({
      data: {
        signUp: results.signUp,
      },
    })),
  },
  getCurrentUser: {
    request: {
      query: queries.getCurrentUser,
      variables: variables.getCurrentUser,
    },
    result: jest.fn(() => ({
      data: results.getCurrentUser,
    })),
  },
  signUpInWorkspace: {
    request: {
      query: queries.signUpInWorkspace,
      variables: variables.signUpInWorkspace,
    },
    result: jest.fn(() => ({
      data: {
        signUpInWorkspace: results.signUpInWorkspace,
      },
    })),
  },
};
