import type { ThemePack } from '../types';
import { dreamContent } from './content';
import { createDreamRenderer } from './renderer';
import css from './theme.css?inline';

const dream: ThemePack = {
  id: 'dream',
  name: 'Dream Weaver',
  tagline: 'Harvest the dreams of a sleeping city.',
  icon: '🌙',
  themeColor: '#0b0b1e',
  content: dreamContent,
  css,
  fontUrls: ['https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;1,500&family=Quicksand:wght@400;600;700&display=swap'],
  createMapRenderer: createDreamRenderer,
};

export default dream;
