/**
 * Recorder Module - Audio recording using Web Audio API
 * Handles microphone capture with device selection
 */

class AudioRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.audioContext = null;
        this.analyser = null;
        this.stream = null;
        this.isRecording = false;
        this.selectedDeviceId = null;
        this.availableDevices = [];
    }

    /**
     * Get list of available audio input devices
     */
    async getAudioDevices() {
        try {
            // Need to request permission first to get device labels
            await navigator.mediaDevices.getUserMedia({ audio: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableDevices = devices.filter(d => d.kind === 'audioinput');
            return this.availableDevices.map(d => ({
                deviceId: d.deviceId,
                label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
                isDefault: d.deviceId === 'default'
            }));
        } catch (error) {
            console.error('Failed to enumerate devices:', error);
            throw new Error('Microphone access denied. Please allow microphone access.');
        }
    }

    /**
     * Set the audio input device
     */
    setDevice(deviceId) {
        this.selectedDeviceId = deviceId;
        // Close existing stream if any
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }

    /**
     * Initialize recorder with selected device
     */
    async initialize(deviceId = null) {
        if (deviceId) this.selectedDeviceId = deviceId;

        try {
            const constraints = {
                audio: this.selectedDeviceId
                    ? { deviceId: { exact: this.selectedDeviceId } }
                    : true
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Resume audio context if suspended
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;

            const source = this.audioContext.createMediaStreamSource(this.stream);
            source.connect(this.analyser);

            console.log('Recorder initialized with device:', this.selectedDeviceId || 'default');
            return true;
        } catch (error) {
            console.error('Failed to initialize recorder:', error);
            throw new Error('Failed to access microphone: ' + error.message);
        }
    }

    async startRecording() {
        if (this.isRecording) return false;

        // Initialize if not already
        if (!this.stream) {
            await this.initialize();
        }

        this.audioChunks = [];

        // Use a supported mime type
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm';

        this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });

        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.audioChunks.push(event.data);
            }
        };

        this.mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error:', event.error);
        };

        this.mediaRecorder.start(100);
        this.isRecording = true;
        console.log('Recording started');
        return true;
    }

    async stopRecording() {
        return new Promise((resolve) => {
            if (!this.isRecording || !this.mediaRecorder) {
                console.log('Not recording, nothing to stop');
                resolve(null);
                return;
            }

            this.mediaRecorder.onstop = () => {
                console.log('Recording stopped, chunks:', this.audioChunks.length);

                if (this.audioChunks.length === 0) {
                    console.error('No audio data recorded');
                    this.isRecording = false;
                    resolve(null);
                    return;
                }

                // Return webm directly - ElevenLabs accepts it
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                console.log('Audio blob created, size:', audioBlob.size);
                this.isRecording = false;
                resolve(audioBlob);
            };

            this.mediaRecorder.stop();
        });
    }

    async convertToWav(webmBlob) {
        const arrayBuffer = await webmBlob.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        const wavBuffer = this.audioBufferToWav(audioBuffer);
        return new Blob([wavBuffer], { type: 'audio/wav' });
    }

    audioBufferToWav(audioBuffer) {
        const numChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const format = 1;
        const bitDepth = 16;
        const bytesPerSample = bitDepth / 8;
        const blockAlign = numChannels * bytesPerSample;
        const samples = audioBuffer.length;
        const dataSize = samples * blockAlign;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        // WAV header
        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        this.writeString(view, 8, 'WAVE');
        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitDepth, true);
        this.writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        const channelData = [];
        for (let i = 0; i < numChannels; i++) {
            channelData.push(audioBuffer.getChannelData(i));
        }

        let offset = 44;
        for (let i = 0; i < samples; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
                const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                view.setInt16(offset, intSample, true);
                offset += 2;
            }
        }

        return buffer;
    }

    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    getAnalyserData() {
        if (!this.analyser) return null;
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteTimeDomainData(dataArray);
        return dataArray;
    }

    cleanup() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
    }
}

// Export
window.AudioRecorder = AudioRecorder;
