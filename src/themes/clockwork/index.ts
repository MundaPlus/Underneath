import type { ThemePack } from '../types';
import { clockworkContent } from './content';
import { createClockworkRenderer } from './renderer';
import css from './theme.css?inline';

const clockwork: ThemePack = {
  id: 'clockwork',
  name: 'Clockwork Afterlife Bureau',
  tagline: 'Process the souls of the dead, in triplicate.',
  icon: '⚙️',
  themeColor: '#16100b',
  content: clockworkContent,
  css,
  fontUrls: ['https://fonts.googleapis.com/css2?family=Special+Elite&family=Lato:wght@400;700&display=swap'],
  createMapRenderer: createClockworkRenderer,
};

export default clockwork;
