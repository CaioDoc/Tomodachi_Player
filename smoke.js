const { app } = require('electron');
console.log('Pronto:', typeof app.whenReady);
app.quit();
