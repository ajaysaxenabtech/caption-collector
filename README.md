# Caption Collector

A local Windows-friendly browser app that reads visible Microsoft Teams captions with OCR and saves them as text. It does not need a Teams tenant administrator, a Microsoft Graph permission, an API key, or a cloud account. The app does not upload meeting audio or screenshots; the selected window is processed in your browser. The text is written by a server bound to `127.0.0.1`. This project is inside a OneDrive folder, so saved transcripts may sync through your OneDrive settings.

## Start

1. Install Node.js 20 or newer. Open PowerShell in this folder and run `npm ci` once to install the dependencies from `package-lock.json`.
2. Double-click `launch.cmd`. It starts the local server in the background and opens the app in your default browser.
3. If needed, open `http://127.0.0.1:8765/` in a regular Edge or Chrome window. The embedded agent browser cannot show the window-sharing picker.
4. In Teams, turn on captions. Put Teams and the collector browser side by side.
5. Click **Choose window** and select the Teams meeting window in the browser's sharing dialog.
6. The lower part of the window is selected automatically. If the caption box is elsewhere, drag a tighter rectangle around it in the preview. Include the speaker name if shown. Avoid the meeting video and controls.
7. Click **Start reading captions**. Keep the Teams window and collector page visible. At the end, click **Stop & save**.
8. Click **Download transcript**. The file is also saved in `sessions/` next to this README. Click **Download raw OCR** if the cleaned transcript missed a line. **Copy summary request** copies the saved transcript and a summarization prompt to your clipboard; paste it into this chat for the final summary.

## Use on another Windows computer

1. Install Node.js 20 or newer and Git. Clone the repository, or download its ZIP from GitHub and extract it.
2. Open PowerShell in the extracted `caption-collector` folder and run `npm ci`. Internet access is needed for this first install.
3. Double-click `launch.cmd` and use the **Start** steps above. The app runs on that computer at `http://127.0.0.1:8765/`; GitHub Pages cannot run its local server.
4. Transcripts are saved in that computer's `sessions/` folder. This folder is excluded from Git, so cloning the repository does not transfer past meetings. Copy only the transcript files you want to move, separately.

To update a cloned copy later, run `git pull` and then `npm ci` in the app folder.

## Coverage and limits

- Start before the meeting to capture the whole discussion. Earlier captions cannot be recovered by this app.
- OCR reads only the rectangle you select. Keep Teams captions on, the window visible, and the collector browser page visible. Minimized windows and background browser tabs can interrupt capture.
- OCR may misread words, split lines, or miss rapid speech. The raw OCR log preserves each changed snapshot, while the main transcript removes many repeated and partial lines. Check both before preparing a full summary.
- This version reads English captions. It saves the words as shown by Teams and does not translate them.
- Each press of **Start reading captions** creates a new session. The most recent session can be downloaded again after refreshing the page.

The app stores no recording of the meeting audio or video. It saves OCR text only. Treat that transcript according to your meeting's sharing rules.
