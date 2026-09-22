import { randomUUID } from 'node:crypto';

import { createOneOperationFactory } from 'test/integration/graphql/utils/create-one-operation-factory.util';
import { deleteOneOperationFactory } from 'test/integration/graphql/utils/delete-one-operation-factory.util';
import { destroyOneOperationFactory } from 'test/integration/graphql/utils/destroy-one-operation-factory.util';
import { findOneOperationFactory } from 'test/integration/graphql/utils/find-one-operation-factory.util';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import { restoreOneOperationFactory } from 'test/integration/graphql/utils/restore-one-operation-factory.util';

const PERSON_GQL_FIELDS = `
  id
  deletedAt
  name {
    firstName
    lastName
  }
  emails {
    primaryEmail
  }
`;

describe('Person email uniqueness', () => {
  const createdPersonIds: string[] = [];

  const createPerson = async (email: string) => {
    const response = await makeGraphqlAPIRequest(
      createOneOperationFactory({
        objectMetadataSingularName: 'person',
        gqlFields: PERSON_GQL_FIELDS,
        data: {
          name: { firstName: 'Email', lastName: 'Uniqueness' },
          emails: { primaryEmail: email },
        },
      }),
    );

    expect(response.body.errors).toBeUndefined();

    const personId = response.body.data?.createPerson?.id;

    expect(personId).toEqual(expect.any(String));

    if (typeof personId !== 'string') {
      throw new Error('Expected createPerson to return an id');
    }

    createdPersonIds.push(personId);

    return personId;
  };

  afterEach(async () => {
    for (const personId of createdPersonIds) {
      await makeGraphqlAPIRequest(
        destroyOneOperationFactory({
          objectMetadataSingularName: 'person',
          gqlFields: 'id',
          recordId: personId,
        }),
      );
    }

    createdPersonIds.length = 0;
  });

  it('rejects two active people with the same email', async () => {
    const email = `active-duplicate-${randomUUID()}@example.com`;

    await createPerson(email);

    const duplicateResponse = await makeGraphqlAPIRequest(
      createOneOperationFactory({
        objectMetadataSingularName: 'person',
        gqlFields: PERSON_GQL_FIELDS,
        data: {
          name: { firstName: 'Duplicate', lastName: 'Active' },
          emails: { primaryEmail: email },
        },
      }),
    );

    expect(duplicateResponse.body.data?.createPerson).toBeNull();
    expect(duplicateResponse.body.errors?.[0]?.message).toMatch(
      /already exists|duplicate/i,
    );
  });

  it('allows a new active person to reuse a deleted person email', async () => {
    const email = `deleted-reuse-${randomUUID()}@example.com`;
    const deletedPersonId = await createPerson(email);

    const deleteResponse = await makeGraphqlAPIRequest(
      deleteOneOperationFactory({
        objectMetadataSingularName: 'person',
        gqlFields: PERSON_GQL_FIELDS,
        recordId: deletedPersonId,
      }),
    );

    expect(deleteResponse.body.errors).toBeUndefined();

    const activePersonId = await createPerson(email);
    const findResponse = await makeGraphqlAPIRequest(
      findOneOperationFactory({
        objectMetadataSingularName: 'person',
        gqlFields: PERSON_GQL_FIELDS,
        filter: { id: { eq: activePersonId } },
      }),
    );

    expect(findResponse.body.errors).toBeUndefined();
    expect(findResponse.body.data?.person).toMatchObject({
      id: activePersonId,
      deletedAt: null,
      emails: { primaryEmail: email },
    });
  });

  it('rejects restoring a deleted person when an active person owns the email', async () => {
    const email = `restore-conflict-${randomUUID()}@example.com`;
    const deletedPersonId = await createPerson(email);

    await makeGraphqlAPIRequest(
      deleteOneOperationFactory({
        objectMetadataSingularName: 'person',
        gqlFields: PERSON_GQL_FIELDS,
        recordId: deletedPersonId,
      }),
    );

    await createPerson(email);

    const restoreResponse = await makeGraphqlAPIRequest(
      restoreOneOperationFactory({
        objectMetadataSingularName: 'person',
        gqlFields: PERSON_GQL_FIELDS,
        recordId: deletedPersonId,
      }),
    );

    expect(restoreResponse.body.data?.restorePerson).toBeNull();
    expect(restoreResponse.body.errors?.[0]?.message).toMatch(
      /already exists|duplicate/i,
    );
  });

  it('preserves existing person data while enforcing the constraint', async () => {
    const email = `preserved-${randomUUID()}@example.com`;
    const personId = await createPerson(email);

    const response = await makeGraphqlAPIRequest(
      findOneOperationFactory({
        objectMetadataSingularName: 'person',
        gqlFields: PERSON_GQL_FIELDS,
        filter: { id: { eq: personId } },
      }),
    );

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data?.person).toMatchObject({
      id: personId,
      name: { firstName: 'Email', lastName: 'Uniqueness' },
      emails: { primaryEmail: email },
      deletedAt: null,
    });
  });
});
