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
    'No part of this book may be reproduced, distributed, or transmitted in any form or by any means, including photocopying, recording, or other electronic or mechanical methods, without the prior written permission of the author, except in the case of brief quotations embodied in critical reviews and certain other noncommercial uses permitted by copyright law.',
  aiDisclaimer:
    'This book was created with the assistance of the NovelGenerator tool and other artificial intelligence tools. The author who generated and published this book is solely and fully responsible for the entire content, including any inaccuracies, errors, intellectual property issues, or any other consequences arising from the use of AI tools or the final work.',
  liabilityDisclaimer:
    'The author is exclusively responsible for ensuring that the content does not infringe any third-party rights and for compliance with all applicable laws. NovelGenerator and its creators act solely as providers of software tools and disclaim all liability for the creation, publication, distribution, or content of this book.',
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
