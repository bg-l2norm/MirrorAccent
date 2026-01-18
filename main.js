const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: '#F5F5F7',
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile('index.html');

    // Request microphone permission
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media') {
            callback(true);
        } else {
            callback(false);
        }
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Store API key securely in memory
let apiKey = null;

ipcMain.handle('set-api-key', (event, key) => {
    apiKey = key;
    return { success: true };
});

ipcMain.handle('get-api-key', () => {
    return apiKey;
});

// ElevenLabs API calls
ipcMain.handle('elevenlabs-request', async (event, { endpoint, method, body, isFormData, audioData, audioType, voiceSettings }) => {
    if (!apiKey) {
        throw new Error('API key not set');
    }

    try {
        let fetchBody;
        let headers = {
            'xi-api-key': apiKey
        };

        if (isFormData && audioData) {
            // Build multipart form data manually
            const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
            headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;

            // Convert array back to Buffer
            const audioBuffer = Buffer.from(audioData);
            const ext = audioType.includes('webm') ? 'webm' : 'wav';
            const mimeType = audioType || 'audio/webm';

            // Build multipart body
            let bodyParts = [];

            // Audio file part
            bodyParts.push(`--${boundary}`);
            bodyParts.push(`Content-Disposition: form-data; name="audio"; filename="input.${ext}"`);
            bodyParts.push(`Content-Type: ${mimeType}`);
            bodyParts.push('');

            // Add voice settings
            let textParts = [];
            if (voiceSettings) {
                textParts.push(`--${boundary}`);
                textParts.push('Content-Disposition: form-data; name="model_id"');
                textParts.push('');
                textParts.push(voiceSettings.model_id);

                textParts.push(`--${boundary}`);
                textParts.push('Content-Disposition: form-data; name="voice_settings"');
                textParts.push('');
                textParts.push(voiceSettings.voice_settings);
            }

            textParts.push(`--${boundary}--`);

            // Combine text parts with audio
            const beforeAudio = Buffer.from(bodyParts.join('\r\n') + '\r\n');
            const afterAudio = Buffer.from('\r\n' + textParts.join('\r\n'));

            fetchBody = Buffer.concat([beforeAudio, audioBuffer, afterAudio]);

        } else if (!isFormData && body) {
            headers['Content-Type'] = 'application/json';
            fetchBody = JSON.stringify(body);
        }

        console.log('Making API request to:', endpoint);

        const response = await fetch(`https://api.elevenlabs.io${endpoint}`, {
            method,
            headers,
            body: fetchBody
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('API error:', response.status, error);
            throw new Error(`API Error: ${response.status} - ${error}`);
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        } else {
            // Return audio as base64
            const buffer = await response.arrayBuffer();
            console.log('Received audio response, size:', buffer.byteLength);
            return { audio: Buffer.from(buffer).toString('base64') };
        }
    } catch (error) {
        console.error('Request failed:', error.message);
        throw new Error(error.message);
    }
});
