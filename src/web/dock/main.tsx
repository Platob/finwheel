import '@fontsource/cinzel/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '../common/theme.css';
import './dock.css';

import { render } from 'preact';
import { App } from './App';

render(<App />, document.getElementById('app')!);
