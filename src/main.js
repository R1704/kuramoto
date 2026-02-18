import { startApp } from './app/bootstrap.js';
import { showError } from './utils/index.js';

startApp().catch((error) => {
    console.error('Fatal error during initialization:', error);
    showError('Failed to initialize: ' + error.message);
});
