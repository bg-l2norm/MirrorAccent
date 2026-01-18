/**
 * ElevenLabs API Wrapper
 * Handles voice cloning, speech-to-speech, and text-to-speech operations
 */

class ElevenLabsAPI {
    constructor() {
        this.isInitialized = false;
        this.clonedVoiceId = null;
        this.accentVoices = {
            'british-rp': 'pNInz6obpgDQGcFmaJgB',      // Adam (British)
            'american-general': '21m00Tcm4TlvDq8ikWAM', // Rachel
            'australian': 'AZnzlk1XvdvUeBnXmlld',       // Domi
            'irish': 'IKne3meq5aSn9XLyUdCD',           // Charlie
            'indian': 'SOYHLrjzK2X1ezoPC6cr',          // Harry
            'south-african': 'TX3LPaxmHKxFdv7VOQHJ'    // Liam
        };
    }

    async initialize(apiKey) {
        if (!apiKey) {
            throw new Error('API key is required');
        }

        // Store the API key - validation happens on actual API calls
        await window.electronAPI.setApiKey(apiKey);
        this.isInitialized = true;
        return { success: true };
    }

    /**
     * Get all available voices
     */
    async getVoices() {
        if (!this.isInitialized) {
            throw new Error('API not initialized');
        }

        return await window.electronAPI.elevenLabsRequest({
            endpoint: '/v1/voices',
            method: 'GET'
        });
    }

    /**
     * Clone user's voice from recordings
     * @param {string} name - Name for the cloned voice
     * @param {Blob[]} audioFiles - Array of audio blobs
     * @returns {object} - Voice object with voice_id
     */
    async cloneVoice(name, audioFiles) {
        if (!this.isInitialized) {
            throw new Error('API not initialized');
        }

        // Create FormData
        const formData = new FormData();
        formData.append('name', name);
        formData.append('description', 'Voice cloned for accent training via MirrorAccent');

        // Add each audio file
        audioFiles.forEach((file, index) => {
            formData.append('files', file, `recording_${index + 1}.wav`);
        });

        const response = await window.electronAPI.elevenLabsRequest({
            endpoint: '/v1/voices/add',
            method: 'POST',
            body: formData,
            isFormData: true
        });

        if (response.voice_id) {
            this.clonedVoiceId = response.voice_id;
        }

        return response;
    }

    /**
     * Convert speech to speech with target accent
     * Uses speech-to-speech API to transform input audio
     * @param {Blob} audioBlob - Input audio
     * @param {string} targetAccent - Target accent ID
     * @returns {Blob} - Transformed audio
     */
    async speechToSpeech(audioBlob, targetAccent) {
        if (!this.isInitialized) {
            throw new Error('API not initialized');
        }

        const targetVoiceId = this.accentVoices[targetAccent];
        if (!targetVoiceId) {
            throw new Error(`Unknown accent: ${targetAccent}`);
        }

        // Convert blob to ArrayBuffer for IPC transfer
        const audioArrayBuffer = await audioBlob.arrayBuffer();
        const audioArray = Array.from(new Uint8Array(audioArrayBuffer));

        const response = await window.electronAPI.elevenLabsRequest({
            endpoint: `/v1/speech-to-speech/${targetVoiceId}`,
            method: 'POST',
            audioData: audioArray,
            audioType: audioBlob.type,
            voiceSettings: {
                model_id: 'eleven_english_sts_v2',
                voice_settings: JSON.stringify({
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0.5,
                    use_speaker_boost: true
                })
            },
            isFormData: true
        });

        // Convert base64 audio to blob
        if (response.audio) {
            const binaryString = atob(response.audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return new Blob([bytes], { type: 'audio/mpeg' });
        }

        throw new Error('No audio returned from speech-to-speech');
    }

    /**
     * Generate speech from text using cloned voice with target accent characteristics
     * @param {string} text - Text to speak
     * @param {string} targetAccent - Target accent ID
     * @returns {Blob} - Generated audio
     */
    async textToSpeechWithAccent(text, targetAccent) {
        if (!this.isInitialized) {
            throw new Error('API not initialized');
        }

        const targetVoiceId = this.accentVoices[targetAccent];
        if (!targetVoiceId) {
            throw new Error(`Unknown accent: ${targetAccent}`);
        }

        const response = await window.electronAPI.elevenLabsRequest({
            endpoint: `/v1/text-to-speech/${targetVoiceId}`,
            method: 'POST',
            body: {
                text: text,
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0.4,
                    use_speaker_boost: true
                }
            }
        });

        // Convert base64 audio to blob
        if (response.audio) {
            const binaryString = atob(response.audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return new Blob([bytes], { type: 'audio/mpeg' });
        }

        throw new Error('No audio returned from text-to-speech');
    }

    /**
     * Create accent version of user's voice
     * Records user → Creates clone → Applies accent characteristics
     * @param {Blob[]} recordings - User's voice recordings
     * @param {string} targetAccent - Target accent
     * @returns {string} - Generated audio URL for the accent voice
     */
    async createAccentVoice(recordings, targetAccent) {
        // Step 1: Clone the user's voice
        const userName = `MirrorAccent_User_${Date.now()}`;
        const cloneResult = await this.cloneVoice(userName, recordings);

        if (!cloneResult.voice_id) {
            throw new Error('Failed to clone voice');
        }

        // Step 2: Generate sample audio with cloned voice
        // This gives us the user's voice characteristics
        const sampleText = "Hello, I'm practicing my accent with MirrorAccent. Listen to how I sound now.";

        const response = await window.electronAPI.elevenLabsRequest({
            endpoint: `/v1/text-to-speech/${cloneResult.voice_id}`,
            method: 'POST',
            body: {
                text: sampleText,
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                    stability: 0.7,
                    similarity_boost: 0.9
                }
            }
        });

        return {
            voiceId: cloneResult.voice_id,
            voiceName: userName,
            targetAccent: targetAccent,
            sampleAudio: response.audio ? this.base64ToBlob(response.audio) : null
        };
    }

    /**
     * Generate practice prompt audio with target accent
     * @param {string} text - Practice prompt text
     * @param {string} targetAccent - Target accent
     * @returns {Blob} - Audio blob
     */
    async generatePracticeAudio(text, targetAccent) {
        return await this.textToSpeechWithAccent(text, targetAccent);
    }

    /**
     * Delete a cloned voice (cleanup)
     * @param {string} voiceId - Voice ID to delete
     */
    async deleteVoice(voiceId) {
        if (!this.isInitialized) {
            throw new Error('API not initialized');
        }

        await window.electronAPI.elevenLabsRequest({
            endpoint: `/v1/voices/${voiceId}`,
            method: 'DELETE'
        });
    }

    base64ToBlob(base64, type = 'audio/mpeg') {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return new Blob([bytes], { type });
    }

    getAccentVoiceId(accent) {
        return this.accentVoices[accent];
    }

    getAccentName(accent) {
        const names = {
            'british-rp': 'British (RP)',
            'american-general': 'American (General)',
            'australian': 'Australian',
            'irish': 'Irish',
            'indian': 'Indian English',
            'south-african': 'South African'
        };
        return names[accent] || accent;
    }
}

// Export
window.ElevenLabsAPI = ElevenLabsAPI;
