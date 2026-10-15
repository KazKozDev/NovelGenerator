export interface ImprintData {
  enabled: boolean;
  edition: string;
  year?: string;
  isbnPaperback?: string;
  isbnEbook?: string;
  publisher?: string;
}

export const FIXED_IMPRINT_TEXT = {
  rights: 'All rights reserved.',
  reproduction:
    'No part of this book may be reproduced, distributed, scanned, translated, or transmitted in any form or by any means, including photocopying, recording, or other electronic or mechanical methods, without the prior written permission of the author, except in the case of brief quotations embodied in critical reviews and certain other noncommercial uses permitted by copyright law.',
  aiDisclaimer:
    'This book was created with the assistance of the NovelGenerator tool and other artificial intelligence tools for generating draft text, images, and/or editorial suggestions. The author who generated and published this book is solely and fully responsible for the entire content, including any inaccuracies, errors, omissions, intellectual property issues, or any other consequences arising from the use of AI tools or the final work. The author takes complete and exclusive responsibility for all aspects of this book.',
  liabilityDisclaimer:
    'The author expressly warrants and represents that the entire content of this book does not infringe upon any copyright, trademark, patent, trade secret, privacy, publicity, or any other intellectual property or proprietary rights of any third party. The author assumes sole, exclusive, and unreserved legal and financial liability for securing all necessary licenses, permissions, and releases for any third-party content, characters, names, data, or source material. The author bears exclusive responsibility for the publication, commercial and non-commercial distribution, marketing, age classification, content warnings, and dissemination of this work across all jurisdictions, territories, and sales channels, and warrants strict compliance with all applicable local, regional, national, and international laws, regulations, consumer protection statutes, trade laws, obscenity standards, and defamation/libel regulations. NovelGenerator, its creators, developers, contributors, and affiliated AI technology providers act solely as technical suppliers of general-purpose software tools and disclaim all express or implied warranties. Under no circumstances shall NovelGenerator, its creators, or contributors be liable for any direct, indirect, incidental, consequential, special, statutory, or punitive damages, claims, fines, regulatory enforcement, or legal proceedings arising from or connected with the creation, publication, distribution, or reading of this work. The author agrees to defend, indemnify, and hold harmless NovelGenerator and its creators from and against any and all claims, liabilities, damages, losses, and legal expenses.',
  fictionDisclaimer:
    'This is a work of fiction. Names, characters, places, and incidents either are the product of the author’s imagination or are used fictitiously. Any resemblance to actual persons, living or dead, events, or locales is entirely coincidental.',
  publisher: 'Published by NG Press',
  defaultEdition: 'First edition',
};

export function getDefaultImprintData(): ImprintData {
  return {
    enabled: true,
    edition: FIXED_IMPRINT_TEXT.defaultEdition,
    year: new Date().getFullYear().toString(),
    isbnPaperback: '',
    isbnEbook: '',
    publisher: 'NG Press',
  };
}

export interface ResolvedColophon {
  copyright: string;
  rights: string;
  reproduction: string;
  aiDisclaimer: string;
  liabilityDisclaimer: string;
  fictionDisclaimer: string;
  isbns: string[];
  publisher: string;
  editionLine: string;
  plainText: string;
}

export function resolveImprintColophon(
  author: string,
  imprint?: Partial<ImprintData>
): ResolvedColophon {
  const currentYear = imprint?.year || new Date().getFullYear().toString();
  const authorName = author?.trim() || 'Author';
  const edition = imprint?.edition?.trim() || FIXED_IMPRINT_TEXT.defaultEdition;

  const isbns: string[] = [];
  if (imprint?.isbnPaperback?.trim()) {
    isbns.push(`ISBN ${imprint.isbnPaperback.trim()} (paperback)`);
  }
  if (imprint?.isbnEbook?.trim()) {
    isbns.push(`ISBN ${imprint.isbnEbook.trim()} (ebook)`);
  }

  const copyright = `Copyright © ${currentYear} ${authorName}`;
  const rights = FIXED_IMPRINT_TEXT.rights;
  const reproduction = FIXED_IMPRINT_TEXT.reproduction;
  const aiDisclaimer = FIXED_IMPRINT_TEXT.aiDisclaimer;
  const liabilityDisclaimer = FIXED_IMPRINT_TEXT.liabilityDisclaimer;
  const fictionDisclaimer = FIXED_IMPRINT_TEXT.fictionDisclaimer;
  const publisher = FIXED_IMPRINT_TEXT.publisher;
  const editionLine = `${edition}, ${currentYear}`;

  const plainTextParts = [
    copyright,
    rights,
    '',
    reproduction,
    '',
    aiDisclaimer,
    '',
    liabilityDisclaimer,
    '',
    fictionDisclaimer,
    ...(isbns.length ? ['', ...isbns] : []),
    '',
    publisher,
    editionLine,
  ];

  return {
    copyright,
    rights,
    reproduction,
    aiDisclaimer,
    liabilityDisclaimer,
    fictionDisclaimer,
    isbns,
    publisher,
    editionLine,
    plainText: plainTextParts.join('\n'),
  };
}
