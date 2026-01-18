## MirrorAccent

This is an AI-powered voice coaching app.
It helps you practice any accent by letting you hear *your own voice* transformed into a target accent, and then giving you technical feedback on how to match it.

<img width="1920" height="1080" alt="20260118110050" src="https://github.com/user-attachments/assets/898ea40c-bb02-435a-b6a8-d8e0c53635ef" />
<img width="1920" height="1080" alt="20260118122059" src="https://github.com/user-attachments/assets/0a041d3d-0607-47e8-9f0b-6d51fe3ac8d4" />
<img width="1920" height="1080" alt="20260118122049" src="https://github.com/user-attachments/assets/badc7b84-a041-4ebe-999f-248cbfab7037" />

## Usage

1.  **Clone and Install:**
    ```bash
    git clone <your-repo-link>
    cd MirrorAccent
    npm install
    npm start
    ```
2.  **Settings:** Click the gear icon in the top right. 
    *   Select your **Microphone**.
    *   Enter your **ElevenLabs API Key**.
3.  **Practice:**
    *   Pick an accent (British, American, etc.).
    *   Read the prompt and hit Record.
    *   Click **Transform & Analyze** to hear your "accented self" and see your prosody scores.

## Special Note:
*   **API Permissions:** Your ElevenLabs API key needs `speech_to_speech` permissions.

## Prosody Metrics
- F0 (Pitch)
- F1/F2 frequencies (vowel quality)
- Intensity
- Speaking Rate (measured in syllables per second)
- Pitch Range
- Duration

## Built With
- ElevenLabs S2S API, Electron, Web Audio API, custom prosody logic (Algorithms for pitch (YIN) and resonance (LPC) comparison)




