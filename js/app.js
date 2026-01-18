/**
 * MirrorAccent - Main Application Controller
 * Simplified flow: Select accent → Practice with Speech-to-Speech → Compare & Analyze
 */

class MirrorAccentApp {
    constructor() {
        // Modules
        this.recorder = new AudioRecorder();
        this.api = new ElevenLabsAPI();
        this.prosody = new ProsodyAnalyzer();

        // State
        this.currentScreen = 'welcome';
        this.selectedAccent = null;
        this.isRecording = false;
        this.userRecordingBlob = null;
        this.accentTransformedBlob = null;
        this.userFeatures = null;
        this.targetFeatures = null;

        // Session stats
        this.sessionStats = { attempts: 0, totalScore: 0, bestScore: 0 };

        // Practice prompts
        this.prompts = [
            "The weather today is absolutely beautiful, isn't it?",
            "Could you please pass me that book on the table?",
            "I've been thinking about going to the cinema this weekend.",
            "What time does the train arrive at the station?",
            "She asked if we could meet for coffee tomorrow morning.",
            "The restaurant around the corner serves excellent food.",
            "I haven't seen such a magnificent sunset in years.",
            "Would you mind helping me carry these bags upstairs?",
            "They're planning to renovate the old building next month.",
            "I'd rather stay home and read a good book tonight."
        ];
        this.currentPrompt = null;

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.checkApiKey();
        // Enumerate audio devices for selection
        await this.loadAudioDevices();
    }

    async loadAudioDevices() {
        try {
            const devices = await this.recorder.getAudioDevices();
            const select = document.getElementById('audio-device-select');
            if (select) {
                select.innerHTML = devices.map(d =>
                    `<option value="${d.deviceId}" ${d.isDefault ? 'selected' : ''}>${d.label}</option>`
                ).join('');
            }
        } catch (error) {
            console.error('Failed to load audio devices:', error);
        }
    }

    bindEvents() {
        // Settings
        document.getElementById('settings-btn').addEventListener('click', () => this.openModal('settings-modal'));
        document.querySelector('.close-modal').addEventListener('click', () => this.closeModal('settings-modal'));
        document.querySelector('.modal-backdrop').addEventListener('click', () => this.closeModal('settings-modal'));
        document.getElementById('save-api-key-btn').addEventListener('click', () => this.saveApiKey());
        document.querySelector('.toggle-visibility').addEventListener('click', (e) => this.togglePasswordVisibility(e));

        // Accent selection - go directly to practice
        document.querySelectorAll('.accent-card').forEach(card => {
            card.addEventListener('click', () => this.selectAccent(card));
        });

        // Practice screen
        document.querySelectorAll('.practice-mode-tabs .tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchPracticeMode(tab));
        });
        document.getElementById('play-target-btn').addEventListener('click', () => this.playTransformedAudio());
        document.getElementById('practice-record-btn').addEventListener('click', () => this.toggleRecording());
        document.getElementById('new-prompt-btn').addEventListener('click', () => this.newPrompt());
        document.getElementById('analyze-btn').addEventListener('click', () => this.transformAndAnalyze());

        // Results screen
        document.getElementById('back-to-practice').addEventListener('click', () => this.showScreen('practice'));
        document.getElementById('try-again-btn').addEventListener('click', () => this.resetPractice());
        document.getElementById('continue-practice-btn').addEventListener('click', () => this.newPrompt());
    }

    async checkApiKey() {
        const apiKey = await window.electronAPI.getApiKey();
        if (!apiKey) {
            this.openModal('settings-modal');
        }
    }

    openModal(modalId) {
        document.getElementById(modalId).classList.add('active');
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }

    togglePasswordVisibility(e) {
        const input = document.getElementById('api-key-input');
        input.type = input.type === 'password' ? 'text' : 'password';
    }

    async saveApiKey() {
        const apiKey = document.getElementById('api-key-input').value.trim();
        if (!apiKey) {
            alert('Please enter an API key');
            return;
        }

        // Save selected microphone
        const deviceSelect = document.getElementById('audio-device-select');
        if (deviceSelect && deviceSelect.value) {
            this.recorder.setDevice(deviceSelect.value);
        }

        await this.api.initialize(apiKey);
        this.closeModal('settings-modal');
        alert('Settings saved!');
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(`screen-${screenId}`).classList.add('active');
        this.currentScreen = screenId;
    }

    // Select accent and go directly to practice mode
    selectAccent(card) {
        document.querySelectorAll('.accent-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this.selectedAccent = card.dataset.accent;
        document.getElementById('selected-accent-name').textContent = card.querySelector('.accent-name').textContent;

        // Go directly to practice mode (skip recording/cloning)
        this.newPrompt();
        this.showScreen('practice');
        this.updatePracticeUI();
    }

    newPrompt() {
        const idx = Math.floor(Math.random() * this.prompts.length);
        this.currentPrompt = this.prompts[idx];
        this.userRecordingBlob = null;
        this.accentTransformedBlob = null;
        document.getElementById('analyze-btn').disabled = true;
        document.getElementById('analyze-btn').textContent = 'Transform & Analyze';
        document.getElementById('user-duration').textContent = '0:00';
        document.getElementById('target-duration').textContent = '0:00';
        // Display prompt
        const promptEl = document.getElementById('practice-prompt');
        if (promptEl) promptEl.textContent = this.currentPrompt;
    }

    resetPractice() {
        this.userRecordingBlob = null;
        this.accentTransformedBlob = null;
        document.getElementById('analyze-btn').disabled = true;
        this.showScreen('practice');
    }

    switchPracticeMode(tab) {
        document.querySelectorAll('.practice-mode-tabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
    }

    updatePracticeUI() {
        document.getElementById('session-count').textContent = this.sessionStats.attempts;
        const avg = this.sessionStats.attempts > 0 ? Math.round((this.sessionStats.totalScore / this.sessionStats.attempts) * 100) : '--';
        document.getElementById('accuracy-score').textContent = typeof avg === 'number' ? `${avg}%` : avg;
    }

    async toggleRecording() {
        const btn = document.getElementById('practice-record-btn');
        const durationEl = document.getElementById('user-duration');

        console.log('toggleRecording called, isRecording:', this.isRecording);

        if (!this.isRecording) {
            // Start recording
            try {
                console.log('Starting recording...');
                btn.classList.add('recording');
                durationEl.textContent = '0:00';

                await this.recorder.initialize();
                const started = await this.recorder.startRecording();

                if (started) {
                    this.isRecording = true;
                    console.log('Recording started successfully');

                    // Start timer
                    this.recordingStartTime = Date.now();
                    this.recordingTimer = setInterval(() => {
                        const elapsed = (Date.now() - this.recordingStartTime) / 1000;
                        durationEl.textContent = this.formatDuration(elapsed);
                    }, 100);
                } else {
                    btn.classList.remove('recording');
                    alert('Failed to start recording');
                }
            } catch (error) {
                console.error('Recording error:', error);
                btn.classList.remove('recording');
                alert('Mic error: ' + error.message);
            }
        } else {
            // Stop recording
            console.log('Stopping recording...');

            // Stop timer
            if (this.recordingTimer) {
                clearInterval(this.recordingTimer);
                this.recordingTimer = null;
            }

            this.userRecordingBlob = await this.recorder.stopRecording();
            btn.classList.remove('recording');
            this.isRecording = false;

            console.log('Recording stopped, blob:', this.userRecordingBlob);

            if (this.userRecordingBlob && this.userRecordingBlob.size > 0) {
                document.getElementById('analyze-btn').disabled = false;

                // Show final duration
                const url = URL.createObjectURL(this.userRecordingBlob);
                const audio = new Audio(url);
                audio.addEventListener('loadedmetadata', () => {
                    durationEl.textContent = this.formatDuration(audio.duration);
                });
            } else {
                console.error('No recording data captured');
                alert('No audio was recorded. Please check your microphone selection in Settings.');
            }
        }
    }

    formatDuration(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    async playTransformedAudio() {
        if (this.accentTransformedBlob) {
            const url = URL.createObjectURL(this.accentTransformedBlob);
            const audio = new Audio(url);
            audio.play();
        } else {
            alert('Record yourself and click "Transform & Analyze" first!');
        }
    }

    async transformAndAnalyze() {
        if (!this.userRecordingBlob) {
            alert('Please record yourself first!');
            return;
        }

        const btn = document.getElementById('analyze-btn');
        btn.disabled = true;
        btn.textContent = 'Transforming...';

        try {
            // Step 1: Speech-to-Speech - transform user's voice to target accent
            this.accentTransformedBlob = await this.api.speechToSpeech(this.userRecordingBlob, this.selectedAccent);

            btn.textContent = 'Analyzing...';

            // Show transformed audio duration
            const url = URL.createObjectURL(this.accentTransformedBlob);
            const audio = new Audio(url);
            audio.addEventListener('loadedmetadata', () => {
                document.getElementById('target-duration').textContent = this.formatDuration(audio.duration);
            });

            // Step 2: Analyze prosody of both
            this.userFeatures = await this.prosody.analyzeAudio(this.userRecordingBlob);
            this.targetFeatures = await this.prosody.analyzeAudio(this.accentTransformedBlob);

            // Step 3: Compare
            const scores = this.prosody.compareProsody(this.targetFeatures, this.userFeatures);
            const feedback = this.prosody.generateFeedback(scores, this.targetFeatures, this.userFeatures);

            // Update stats
            this.sessionStats.attempts++;
            this.sessionStats.totalScore += scores.overall;
            if (scores.overall > this.sessionStats.bestScore) {
                this.sessionStats.bestScore = scores.overall;
            }

            // Display results
            this.displayResults(scores, feedback);
            this.showScreen('results');
            btn.textContent = 'Transform & Analyze';
            btn.disabled = false;

        } catch (error) {
            alert('Error: ' + error.message);
            btn.textContent = 'Transform & Analyze';
            btn.disabled = false;
        }
    }

    displayResults(scores, feedback) {
        // Overall score
        const overallPercent = Math.round(scores.overall * 100);
        document.getElementById('overall-score').textContent = `${overallPercent}%`;
        document.getElementById('score-path').style.strokeDasharray = `${overallPercent}, 100`;

        // Individual metrics
        document.getElementById('f0-score').textContent = `${Math.round(scores.f0 * 100)}%`;
        document.getElementById('formants-score').textContent = `${Math.round(scores.formants * 100)}%`;
        document.getElementById('intensity-score').textContent = `${Math.round(scores.intensity * 100)}%`;
        document.getElementById('rate-score').textContent = `${Math.round(scores.speakingRate * 100)}%`;
        document.getElementById('range-score').textContent = `${Math.round(scores.pitchRange * 100)}%`;
        document.getElementById('duration-score').textContent = `${Math.round(scores.duration * 100)}%`;

        // Feedback
        document.getElementById('feedback-list').innerHTML = feedback.map(f => `<li>${f}</li>`).join('');

        this.updatePracticeUI();
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.app = new MirrorAccentApp();
});
