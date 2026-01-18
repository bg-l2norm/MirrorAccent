const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // API Key management
    setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),
    getApiKey: () => ipcRenderer.invoke('get-api-key'),

    // ElevenLabs API wrapper
    elevenLabsRequest: (options) => ipcRenderer.invoke('elevenlabs-request', options),

    // Convenience methods for ElevenLabs
    async getVoices() {
        return this.elevenLabsRequest({
            endpoint: '/v1/voices',
            method: 'GET'
        });
    },

    async cloneVoice(name, description, audioFiles) {
        const formData = new FormData();
        formData.append('name', name);
        formData.append('description', description);

        audioFiles.forEach((file, index) => {
            formData.append('files', file, `recording_${index}.wav`);
        });

        return this.elevenLabsRequest({
            endpoint: '/v1/voices/add',
            method: 'POST',
            body: formData,
            isFormData: true
        });
    },

    async speechToSpeech(voiceId, audioBlob, modelId = 'eleven_english_sts_v2') {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'input.wav');
        formData.append('model_id', modelId);

        return this.elevenLabsRequest({
            endpoint: `/v1/speech-to-speech/${voiceId}`,
            method: 'POST',
            body: formData,
            isFormData: true
        });
    },

    async textToSpeech(voiceId, text, modelId = 'eleven_multilingual_v2') {
        return this.elevenLabsRequest({
            endpoint: `/v1/text-to-speech/${voiceId}`,
            method: 'POST',
            body: {
                text,
                model_id: modelId,
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            }
        });
    }
});
