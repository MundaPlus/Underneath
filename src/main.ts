import './ui/base.css';
import { startApp } from './ui/app';

startApp(document.getElementById('app')!).catch((err) => {
  console.error(err);
  document.getElementById('app')!.textContent = 'The game failed to load. See the console for details.';
});
