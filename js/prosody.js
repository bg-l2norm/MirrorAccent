/**
 * Prosody Analysis Module
 * Research-grade prosodic metrics: F0, F1/F2 formants, intensity, duration, etc.
 * Uses YIN algorithm for pitch detection and custom formant extraction
 */

class ProsodyAnalyzer {
    constructor() {
        this.audioContext = null;
        this.sampleRate = 44100;
    }

    async initialize() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.sampleRate = this.audioContext.sampleRate;
    }

    /**
     * Analyze audio blob and extract prosodic features
     */
    async analyzeAudio(audioBlob) {
        if (!this.audioContext) {
            await this.initialize();
        }

        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        const samples = audioBuffer.getChannelData(0);

        const features = {
            f0: this.extractF0Contour(samples, this.sampleRate),
            formants: this.extractFormants(samples, this.sampleRate),
            intensity: this.extractIntensity(samples, this.sampleRate),
            duration: audioBuffer.duration,
            speakingRate: this.estimateSpeakingRate(samples, this.sampleRate),
            pitchRange: null // Computed from f0
        };

        // Compute pitch range from F0
        const validF0 = features.f0.values.filter(v => v > 0);
        if (validF0.length > 0) {
            features.pitchRange = {
                min: Math.min(...validF0),
                max: Math.max(...validF0),
                mean: validF0.reduce((a, b) => a + b, 0) / validF0.length,
                variance: this.calculateVariance(validF0)
            };
        }

        return features;
    }

    /**
     * Extract F0 (fundamental frequency) contour using YIN algorithm
     */
    extractF0Contour(samples, sampleRate) {
        const frameSize = Math.floor(sampleRate * 0.025); // 25ms frames
        const hopSize = Math.floor(sampleRate * 0.010);   // 10ms hop
        const minF0 = 50;   // Hz
        const maxF0 = 400;  // Hz

        const minLag = Math.floor(sampleRate / maxF0);
        const maxLag = Math.floor(sampleRate / minF0);

        const f0Values = [];
        const times = [];

        for (let i = 0; i + frameSize < samples.length; i += hopSize) {
            const frame = samples.slice(i, i + frameSize);
            const f0 = this.yinPitchDetection(frame, sampleRate, minLag, maxLag);
            f0Values.push(f0);
            times.push(i / sampleRate);
        }

        return {
            values: f0Values,
            times: times,
            frameRate: 1000 / 10 // 100 fps (10ms hop)
        };
    }

    /**
     * YIN pitch detection algorithm
     */
    yinPitchDetection(frame, sampleRate, minLag, maxLag) {
        const threshold = 0.1;
        const n = frame.length;

        // Difference function
        const diff = new Float32Array(maxLag);
        for (let tau = 1; tau < maxLag; tau++) {
            let sum = 0;
            for (let i = 0; i < n - tau; i++) {
                const delta = frame[i] - frame[i + tau];
                sum += delta * delta;
            }
            diff[tau] = sum;
        }

        // Cumulative mean normalized difference function
        const cmndf = new Float32Array(maxLag);
        cmndf[0] = 1;
        let runningSum = 0;
        for (let tau = 1; tau < maxLag; tau++) {
            runningSum += diff[tau];
            cmndf[tau] = diff[tau] / (runningSum / tau);
        }

        // Find the first minimum below threshold
        let tau = minLag;
        while (tau < maxLag - 1) {
            if (cmndf[tau] < threshold) {
                // Parabolic interpolation for better precision
                while (tau + 1 < maxLag && cmndf[tau + 1] < cmndf[tau]) {
                    tau++;
                }
                break;
            }
            tau++;
        }

        if (tau >= maxLag - 1 || cmndf[tau] >= threshold) {
            return 0; // Unvoiced
        }

        // Parabolic interpolation
        const s0 = cmndf[tau - 1];
        const s1 = cmndf[tau];
        const s2 = cmndf[tau + 1];
        const betterTau = tau + (s2 - s0) / (2 * (2 * s1 - s2 - s0));

        return sampleRate / betterTau;
    }

    /**
     * Extract formants (F1, F2, F3) using LPC analysis
     */
    extractFormants(samples, sampleRate) {
        const frameSize = Math.floor(sampleRate * 0.025);
        const hopSize = Math.floor(sampleRate * 0.010);
        const lpcOrder = 12; // Standard for formant analysis

        const f1Values = [];
        const f2Values = [];
        const f3Values = [];
        const times = [];

        for (let i = 0; i + frameSize < samples.length; i += hopSize) {
            const frame = samples.slice(i, i + frameSize);

            // Apply Hamming window
            const windowed = this.applyHammingWindow(frame);

            // Pre-emphasis
            const preEmph = this.preEmphasis(windowed);

            // LPC analysis
            const lpcCoeffs = this.levinson(this.autocorrelation(preEmph, lpcOrder + 1), lpcOrder);

            // Find formants from LPC roots
            const formants = this.lpcToFormants(lpcCoeffs, sampleRate);

            f1Values.push(formants[0] || 0);
            f2Values.push(formants[1] || 0);
            f3Values.push(formants[2] || 0);
            times.push(i / sampleRate);
        }

        return {
            f1: { values: f1Values, mean: this.mean(f1Values.filter(v => v > 0)) },
            f2: { values: f2Values, mean: this.mean(f2Values.filter(v => v > 0)) },
            f3: { values: f3Values, mean: this.mean(f3Values.filter(v => v > 0)) },
            times: times
        };
    }

    applyHammingWindow(frame) {
        const n = frame.length;
        const windowed = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            windowed[i] = frame[i] * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (n - 1)));
        }
        return windowed;
    }

    preEmphasis(samples, coeff = 0.97) {
        const result = new Float32Array(samples.length);
        result[0] = samples[0];
        for (let i = 1; i < samples.length; i++) {
            result[i] = samples[i] - coeff * samples[i - 1];
        }
        return result;
    }

    autocorrelation(samples, order) {
        const r = new Float32Array(order);
        for (let i = 0; i < order; i++) {
            let sum = 0;
            for (let j = 0; j < samples.length - i; j++) {
                sum += samples[j] * samples[j + i];
            }
            r[i] = sum;
        }
        return r;
    }

    levinson(r, order) {
        const a = new Float32Array(order + 1);
        const e = new Float32Array(order + 1);

        a[0] = 1;
        e[0] = r[0];

        for (let i = 1; i <= order; i++) {
            let lambda = 0;
            for (let j = 0; j < i; j++) {
                lambda += a[j] * r[i - j];
            }
            lambda = -lambda / e[i - 1];

            // Update coefficients
            const aPrev = a.slice();
            for (let j = 1; j <= i; j++) {
                a[j] = aPrev[j] + lambda * aPrev[i - j];
            }

            e[i] = (1 - lambda * lambda) * e[i - 1];
        }

        return a;
    }

    lpcToFormants(lpcCoeffs, sampleRate) {
        // Find roots of LPC polynomial
        const roots = this.findPolynomialRoots(lpcCoeffs);

        // Convert roots to frequencies
        const formants = [];
        for (const root of roots) {
            if (root.imag > 0) { // Only positive frequencies
                const freq = Math.atan2(root.imag, root.real) * sampleRate / (2 * Math.PI);
                const bandwidth = -Math.log(Math.sqrt(root.real * root.real + root.imag * root.imag)) * sampleRate / Math.PI;

                // Filter valid formants (200-5000 Hz, bandwidth < 500 Hz)
                if (freq > 200 && freq < 5000 && bandwidth < 500) {
                    formants.push({ freq, bandwidth });
                }
            }
        }

        // Sort by frequency and return first 3
        formants.sort((a, b) => a.freq - b.freq);
        return formants.slice(0, 3).map(f => f.freq);
    }

    findPolynomialRoots(coeffs) {
        // Simplified root finding using Durand-Kerner method
        const n = coeffs.length - 1;
        const roots = [];

        // Initial guesses spread around unit circle
        for (let i = 0; i < n; i++) {
            const angle = (2 * Math.PI * i) / n;
            roots.push({
                real: 0.9 * Math.cos(angle),
                imag: 0.9 * Math.sin(angle)
            });
        }

        // Iterate to refine roots
        const maxIter = 50;
        for (let iter = 0; iter < maxIter; iter++) {
            for (let i = 0; i < n; i++) {
                // Evaluate polynomial at current root
                const p = this.evaluatePolynomial(coeffs, roots[i]);

                // Compute product of differences
                let denom = { real: 1, imag: 0 };
                for (let j = 0; j < n; j++) {
                    if (i !== j) {
                        const diff = {
                            real: roots[i].real - roots[j].real,
                            imag: roots[i].imag - roots[j].imag
                        };
                        denom = this.complexMul(denom, diff);
                    }
                }

                // Update root
                const correction = this.complexDiv(p, denom);
                roots[i].real -= correction.real;
                roots[i].imag -= correction.imag;
            }
        }

        return roots;
    }

    evaluatePolynomial(coeffs, z) {
        let result = { real: 0, imag: 0 };
        let zPower = { real: 1, imag: 0 };

        for (let i = 0; i < coeffs.length; i++) {
            result.real += coeffs[i] * zPower.real;
            result.imag += coeffs[i] * zPower.imag;
            zPower = this.complexMul(zPower, z);
        }

        return result;
    }

    complexMul(a, b) {
        return {
            real: a.real * b.real - a.imag * b.imag,
            imag: a.real * b.imag + a.imag * b.real
        };
    }

    complexDiv(a, b) {
        const denom = b.real * b.real + b.imag * b.imag;
        return {
            real: (a.real * b.real + a.imag * b.imag) / denom,
            imag: (a.imag * b.real - a.real * b.imag) / denom
        };
    }

    /**
     * Extract intensity (RMS energy) envelope
     */
    extractIntensity(samples, sampleRate) {
        const frameSize = Math.floor(sampleRate * 0.025);
        const hopSize = Math.floor(sampleRate * 0.010);

        const values = [];
        const times = [];

        for (let i = 0; i + frameSize < samples.length; i += hopSize) {
            const frame = samples.slice(i, i + frameSize);

            // RMS calculation
            let sum = 0;
            for (let j = 0; j < frame.length; j++) {
                sum += frame[j] * frame[j];
            }
            const rms = Math.sqrt(sum / frame.length);
            const dB = 20 * Math.log10(rms + 1e-10);

            values.push(dB);
            times.push(i / sampleRate);
        }

        return {
            values: values,
            times: times,
            mean: this.mean(values),
            range: Math.max(...values) - Math.min(...values)
        };
    }

    /**
     * Estimate speaking rate using envelope peak detection
     */
    estimateSpeakingRate(samples, sampleRate) {
        // Get intensity envelope
        const intensity = this.extractIntensity(samples, sampleRate);

        // Smooth the envelope
        const smoothed = this.movingAverage(intensity.values, 5);

        // Find peaks (syllable nuclei approximation)
        const peaks = [];
        for (let i = 1; i < smoothed.length - 1; i++) {
            if (smoothed[i] > smoothed[i - 1] &&
                smoothed[i] > smoothed[i + 1] &&
                smoothed[i] > intensity.mean) {
                peaks.push(i);
            }
        }

        // Calculate speaking rate (syllables per second)
        const duration = samples.length / sampleRate;
        const syllablesPerSecond = peaks.length / duration;

        return {
            syllablesPerSecond: syllablesPerSecond,
            estimatedSyllables: peaks.length,
            duration: duration
        };
    }

    /**
     * Compare two prosodic feature sets and compute similarity scores
     */
    compareProsody(targetFeatures, userFeatures) {
        const scores = {};

        // F0 comparison using Dynamic Time Warping
        scores.f0 = this.dtwSimilarity(
            targetFeatures.f0.values.filter(v => v > 0),
            userFeatures.f0.values.filter(v => v > 0)
        );

        // Formant comparison (F1 and F2 means)
        const f1Similarity = 1 - Math.min(1, Math.abs(
            targetFeatures.formants.f1.mean - userFeatures.formants.f1.mean
        ) / 500);
        const f2Similarity = 1 - Math.min(1, Math.abs(
            targetFeatures.formants.f2.mean - userFeatures.formants.f2.mean
        ) / 800);
        scores.formants = (f1Similarity + f2Similarity) / 2;

        // Intensity comparison
        scores.intensity = this.dtwSimilarity(
            this.normalize(targetFeatures.intensity.values),
            this.normalize(userFeatures.intensity.values)
        );

        // Speaking rate comparison
        const rateDiff = Math.abs(
            targetFeatures.speakingRate.syllablesPerSecond -
            userFeatures.speakingRate.syllablesPerSecond
        );
        scores.speakingRate = Math.max(0, 1 - rateDiff / 3);

        // Pitch range comparison
        if (targetFeatures.pitchRange && userFeatures.pitchRange) {
            const rangeDiff = Math.abs(
                (targetFeatures.pitchRange.max - targetFeatures.pitchRange.min) -
                (userFeatures.pitchRange.max - userFeatures.pitchRange.min)
            );
            scores.pitchRange = Math.max(0, 1 - rangeDiff / 100);
        } else {
            scores.pitchRange = 0.5;
        }

        // Duration comparison
        const durationRatio = Math.min(
            targetFeatures.duration / userFeatures.duration,
            userFeatures.duration / targetFeatures.duration
        );
        scores.duration = durationRatio;

        // Overall score (weighted average)
        scores.overall = (
            scores.f0 * 0.25 +
            scores.formants * 0.20 +
            scores.intensity * 0.15 +
            scores.speakingRate * 0.15 +
            scores.pitchRange * 0.15 +
            scores.duration * 0.10
        );

        return scores;
    }

    /**
     * Dynamic Time Warping similarity (simplified)
     */
    dtwSimilarity(seq1, seq2) {
        if (seq1.length === 0 || seq2.length === 0) return 0;

        const n = Math.min(seq1.length, 100); // Limit for performance
        const m = Math.min(seq2.length, 100);

        // Resample if needed
        const s1 = this.resample(seq1, n);
        const s2 = this.resample(seq2, m);

        // Normalize
        const ns1 = this.normalize(s1);
        const ns2 = this.normalize(s2);

        // DTW matrix
        const dtw = Array(n + 1).fill(null).map(() => Array(m + 1).fill(Infinity));
        dtw[0][0] = 0;

        for (let i = 1; i <= n; i++) {
            for (let j = 1; j <= m; j++) {
                const cost = Math.abs(ns1[i - 1] - ns2[j - 1]);
                dtw[i][j] = cost + Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1]);
            }
        }

        const maxDist = Math.max(n, m);
        const similarity = 1 - Math.min(1, dtw[n][m] / maxDist);

        return similarity;
    }

    resample(arr, targetLen) {
        if (arr.length === targetLen) return arr;

        const result = new Array(targetLen);
        const ratio = arr.length / targetLen;

        for (let i = 0; i < targetLen; i++) {
            const srcIdx = i * ratio;
            const lower = Math.floor(srcIdx);
            const upper = Math.min(lower + 1, arr.length - 1);
            const frac = srcIdx - lower;
            result[i] = arr[lower] * (1 - frac) + arr[upper] * frac;
        }

        return result;
    }

    normalize(arr) {
        const min = Math.min(...arr);
        const max = Math.max(...arr);
        const range = max - min || 1;
        return arr.map(v => (v - min) / range);
    }

    mean(arr) {
        if (arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    calculateVariance(arr) {
        const m = this.mean(arr);
        return arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length;
    }

    movingAverage(arr, windowSize) {
        const result = [];
        for (let i = 0; i < arr.length; i++) {
            const start = Math.max(0, i - Math.floor(windowSize / 2));
            const end = Math.min(arr.length, i + Math.ceil(windowSize / 2));
            const window = arr.slice(start, end);
            result.push(this.mean(window));
        }
        return result;
    }

    /**
     * Generate improvement feedback based on scores
     */
    generateFeedback(scores, targetFeatures, userFeatures) {
        const feedback = [];

        if (scores.f0 < 0.6) {
            const targetRange = targetFeatures.pitchRange;
            const userRange = userFeatures.pitchRange;
            if (userRange && targetRange) {
                if (userRange.mean < targetRange.mean * 0.9) {
                    feedback.push('Try speaking with a slightly higher pitch to match the target accent.');
                } else if (userRange.mean > targetRange.mean * 1.1) {
                    feedback.push('Your pitch is higher than the target. Try lowering it slightly.');
                }
                if ((userRange.max - userRange.min) < (targetRange.max - targetRange.min) * 0.7) {
                    feedback.push('Add more variation to your intonation - the target has a wider pitch range.');
                }
            }
        }

        if (scores.formants < 0.6) {
            feedback.push('Focus on vowel sounds - the resonance differs from the target accent.');
        }

        if (scores.speakingRate < 0.6) {
            const targetRate = targetFeatures.speakingRate.syllablesPerSecond;
            const userRate = userFeatures.speakingRate.syllablesPerSecond;
            if (userRate < targetRate * 0.8) {
                feedback.push('Try speaking a bit faster to match the natural rhythm of this accent.');
            } else if (userRate > targetRate * 1.2) {
                feedback.push('Slow down slightly - take more time with each syllable.');
            }
        }

        if (scores.intensity < 0.6) {
            feedback.push('Pay attention to stress patterns - vary your emphasis on different syllables.');
        }

        if (scores.pitchRange < 0.6) {
            feedback.push('Work on your intonation patterns - try to match the melodic contour of the accent.');
        }

        if (feedback.length === 0) {
            feedback.push('Great work! Keep practicing to maintain consistency.');
        }

        return feedback;
    }
}

// Export
window.ProsodyAnalyzer = ProsodyAnalyzer;
