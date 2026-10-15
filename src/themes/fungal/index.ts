import type { ThemePack } from '../types';
import { fungalContent } from './content';
import { createFungalRenderer } from './renderer';
import css from './theme.css?inline';

const fungal: ThemePack = {
  id: 'fungal',
  name: 'Fungal Network',
  tagline: 'Grow a mycelium under the forest floor.',
  content: fungalContent,
  css,
  fontUrls: ['https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Nunito:wght@400;600;700&display=swap'],
  createMapRenderer: createFungalRenderer,
};

export default fungal;
