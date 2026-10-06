import { isNonEmptyString } from '@sniptt/guards';
import isEmpty from 'lodash.isempty';
import {
  type FieldMetadataSettings,
  type FieldMetadataType,
  type LinkMetadataNullable,
} from 'twenty-shared/types';
import {
  isDefined,
  getLinkUrlNormalizer,
  parseJson,
} from 'twenty-shared/utils';

import { removeEmptyLinks } from 'src/engine/core-modules/record-transformer/utils/remove-empty-links';

export type LinksFieldGraphQLInput =
  | {
      primaryLinkUrl?: string | null;
      primaryLinkLabel?: string | null;
      secondaryLinks?: string | null;
    }
  | null
  | undefined;

export const transformLinksValue = ({
  input,
  settings,
}: {
  input: LinksFieldGraphQLInput;
  settings?: FieldMetadataSettings<FieldMetadataType.LINKS>;
}): LinksFieldGraphQLInput => {
  if (!isDefined(input)) {
    return input;
  }

  const normalizeLinkUrl = getLinkUrlNormalizer(settings?.type);

  const transformed: LinksFieldGraphQLInput & Record<string, unknown> = {
    ...input,
  };

  if (Object.prototype.hasOwnProperty.call(input, 'primaryLinkUrl')) {
    if (isNonEmptyString(input.primaryLinkUrl)) {
      const normalizedUrl = normalizeLinkUrl(input.primaryLinkUrl);
      const validatedLink = removeEmptyLinks({
        primaryLinkUrl: normalizedUrl,
        primaryLinkLabel: null,
        secondaryLinks: [],
      });
      transformed.primaryLinkUrl = validatedLink.primaryLinkUrl;
    } else {
      transformed.primaryLinkUrl = null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, 'primaryLinkLabel')) {
    transformed.primaryLinkLabel = isNonEmptyString(input.primaryLinkLabel)
      ? input.primaryLinkLabel
      : null;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'secondaryLinks')) {
    const secondaryLinksRaw = input.secondaryLinks;
    const secondaryLinksArray = isNonEmptyString(secondaryLinksRaw)
      ? parseJson<LinkMetadataNullable[]>(secondaryLinksRaw)
      : secondaryLinksRaw;

    const { secondaryLinks } = removeEmptyLinks({
      primaryLinkUrl: 'https://preserve-existing.invalid',
      primaryLinkLabel: null,
      secondaryLinks: secondaryLinksArray,
    });

    const processedSecondaryLinks = secondaryLinks?.map((link) => ({
      ...link,
      url: isDefined(link.url) ? normalizeLinkUrl(link.url) : link.url,
    }));

    transformed.secondaryLinks = isEmpty(processedSecondaryLinks)
      ? null
      : JSON.stringify(processedSecondaryLinks);
  }

  return transformed;
};
