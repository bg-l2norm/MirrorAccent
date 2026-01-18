/**
 * Practice Module - Handles Duolingo-style practice modes
 */

class PracticeManager {
    constructor(elevenLabsAPI, prosodyAnalyzer) {
        this.api = elevenLabsAPI;
        this.prosody = prosodyAnalyzer;
        this.currentMode = 'listen-repeat';
        this.targetAccent = null;
        this.sessionStats = { attempts: 0, totalScore: 0, bestScore: 0 };
        this.currentPrompt = null;
        this.targetAudioBlob = null;
        this.targetFeatures = null;
    }

    static PROMPTS = [
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

    async startSession(targetAccent) {
        this.targetAccent = targetAccent;
        this.sessionStats = { attempts: 0, totalScore: 0, bestScore: 0 };
        await this.selectNewPrompt();
    }

    async selectNewPrompt() {
        const randomIndex = Math.floor(Math.random() * PracticeManager.PROMPTS.length);
        this.currentPrompt = PracticeManager.PROMPTS[randomIndex];

        this.targetAudioBlob = await this.api.generatePracticeAudio(this.currentPrompt, this.targetAccent);
        this.targetFeatures = await this.prosody.analyzeAudio(this.targetAudioBlob);

        return { prompt: this.currentPrompt, audioBlob: this.targetAudioBlob };
    }

    async analyzeAttempt(userAudioBlob) {
        const userFeatures = await this.prosody.analyzeAudio(userAudioBlob);
        const scores = this.prosody.compareProsody(this.targetFeatures, userFeatures);
        const feedback = this.prosody.generateFeedback(scores, this.targetFeatures, userFeatures);

        this.sessionStats.attempts++;
        this.sessionStats.totalScore += scores.overall;
        if (scores.overall > this.sessionStats.bestScore) {
            this.sessionStats.bestScore = scores.overall;
        }

        return { scores, feedback, targetFeatures: this.targetFeatures, userFeatures, sessionStats: { ...this.sessionStats } };
    }

    getCurrentPrompt() { return this.currentPrompt; }

    getSessionStats() {
        return { ...this.sessionStats, averageScore: this.sessionStats.attempts > 0 ? this.sessionStats.totalScore / this.sessionStats.attempts : 0 };
    }

    setMode(mode) { this.currentMode = mode; }
    getMode() { return this.currentMode; }
}

window.PracticeManager = PracticeManager;
