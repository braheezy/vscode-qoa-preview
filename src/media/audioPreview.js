import { QOADecoder } from "../qoaDecoder.js";

/*
The design goal is to create a audio player that looks as close as (reasonably) possible to the built-in VS Code audio
player. They simply use the `audio` element and some basic CSS, but naturally, that element does not support QOA files.

Being an Electon app, the Blink web engine is used and so the audio player looks like the default Chrome player.
This file is concerned with:
- Loading and decoding QOA files
- Managing QOA playback
- Handling erros and displaying the VS Code-style error message
- Audio player
*/

(async function () {
	const playPauseBtn = document.querySelector('.play-pause');
	const seekSlider = document.querySelector('.seek-slider');
	const timeDisplay = document.querySelector('.time-display');
	const playIcon = document.getElementById('play-icon');
	const pauseIcon = document.getElementById('pause-icon');
	const muteBtn = document.querySelector('.mute');
	const volumeIcon = document.getElementById('volume-icon');
	const muteIcon = document.getElementById('mute-icon');

	let audioBuffer;
	let context = new AudioContext();
	let gainNode = context.createGain();
	let source;
	let isPlaying = false;
	let duration = 0;
	let startTime = 0;
	let animationFrameId;
	// The audio player progress bar (also seek controls) is going be calculated by keeping timers on
	// how long the audio context has been playing and using math with the sample rate to calculate the
	// exact sample we're on. Then playing at a certain sample and syncing the progress is easier.
	let sampleRate;
	let totalSamples;
	let currentSample = 0;
	let isSeeking = false;
	let isInitialized = false;
	// Track how long the audio context has been paused so we can factor that timing calculations.
	let pauseTime = 0;

	// Ultimately used to get the path the file to play.
	function getSettings() {
		const element = document.getElementById('settings');
		if (element) {
			const data = element.getAttribute('data-settings');
			if (data) {
				return JSON.parse(data);
			}
		}
		throw new Error(`Could not load settings`);
	}

	const settings = getSettings();
	const vscode = acquireVsCodeApi();

	// Load the QOA file, decode it, and put into an AudioBuffer
	// On failure, the audio-player is hidden and error message shown.
	async function fetchAndDecodeAudio() {
		try {
			const response = await fetch(settings.src);
			const buffer = await response.arrayBuffer();

			const decoder = new QOADecoder();
			const view = new DataView(buffer);
			let pos = 0;
			decoder.readByte = () => (pos < buffer.byteLength ? view.getUint8(pos++) : -1);
			decoder.seekToByte = (position) => { pos = position; };

			if (!decoder.readHeader()) {
				throw new Error('Failed to read QOA file header');
			}

			const channels = decoder.getChannels();
			sampleRate = decoder.getSampleRate();
			totalSamples = decoder.getTotalSamples();

			const samples = new Int16Array(totalSamples * channels);
			let sampleIndex = 0;

			while (!decoder.isEnd()) {
				const frameSamples = decoder.readFrame(samples.subarray(sampleIndex));
				if (frameSamples < 0) {
					throw new Error('Failed to read QOA frame');
				}
				sampleIndex += frameSamples * channels;
			}

			audioBuffer = context.createBuffer(channels, samples.length / channels, sampleRate);

			for (let i = 0; i < channels; i++) {
				const channelData = new Float32Array(samples.length / channels);
				for (let j = 0; j < channelData.length; j++) {
					channelData[j] = samples[j * channels + i] / 32768;
				}
				audioBuffer.copyToChannel(channelData, i);
			}

			duration = audioBuffer.duration;
			timeDisplay.textContent = `0:00 / ${formatTime(duration)}`;
			seekSlider.max = duration;
			seekSlider.value = 0; // Force the slider to the beginning
			seekSlider.style.setProperty('--seek-before-width', `0%`); // Set the initial progress bar to 0%

		} catch (error) {
			console.error('Error processing QOA file:', error);

			// Hide the audio-player div
			document.getElementById('audio-player').style.display = 'none';

			// Show the loading-error div
			document.getElementById('loading-error').style.display = 'block';
		}
	}

	// pretty print elapsed time helper
	function formatTime(seconds) {
		const minutes = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
	}

	// Create a new AudioBufferSourceNode and bind the audio buffer to it
	// Once an audio source is start(), it plays to the end (assuming you don't pause) and cleans
	// itself up. So we need a new one of these during "rewind" operations, seeking backwards
	function createSource() {
		source = context.createBufferSource();
		source.buffer = audioBuffer;
		source.connect(gainNode);
		gainNode.connect(context.destination);
		source.onended = () => {
			if (!isSeeking) {
				isPlaying = false;
				playIcon.style.display = 'block';
				pauseIcon.style.display = 'none';
				currentSample = 0;
				seekSlider.value = 0;
				cancelAnimationFrame(animationFrameId);
			}
		};
	}

	// Start or resume audio playback
	function playAudio() {
		// Handle resuming play.
		// The player starts in the "suspended" state because we create the AudioContext without
		// user input. so the extra isInitialized flag helps.
		if (context.state === 'suspended' && isInitialized) {
			context.resume();
			// Resume from the paused time
			startTime = context.currentTime - pauseTime;
		} else {
			if (!isInitialized) {
				isInitialized = true;
			}
			createSource();
			source.start(0, currentSample / sampleRate);
			startTime = context.currentTime - (currentSample / sampleRate);
		}

		isPlaying = true;
		playIcon.style.display = 'none';
		pauseIcon.style.display = 'block';
		updateProgress();
	}

	// Pause audio playback (but keep it alive for later)
	function pauseAudio() {
		if (context.state === 'running') {
			context.suspend();
			pauseTime = context.currentTime - startTime;
			isPlaying = false;
			playIcon.style.display = 'block';
			pauseIcon.style.display = 'none';
			cancelAnimationFrame(animationFrameId);
		}
	}

	// Sync progress bar to sample position
	function updateProgress() {
		const elapsed = context.currentTime - startTime;
		currentSample = elapsed * sampleRate;
		const progress = (elapsed / duration) * 100;
		seekSlider.value = elapsed;
		seekSlider.style.setProperty('--seek-before-width', `${progress}%`);
		timeDisplay.textContent = `${formatTime(elapsed)} / ${formatTime(duration)}`;
		animationFrameId = requestAnimationFrame(updateProgress);
	}

	// Handle new sample position by user
	function seekAudio() {
		const seekTime = currentSample / sampleRate;

		// Get rid of this source and get a new one at the right position
		source.disconnect()
		createSource();
		source.start(0, seekTime);

		if (isPlaying) {
			// Adjust start time based on seek time
			startTime = context.currentTime - seekTime;
		} else {
			// Allow the user to seek while the audio is paused.
			pauseTime = seekTime;
		}
	}

	// Toggle audio playback
	playPauseBtn.addEventListener('click', () => {
		if (isPlaying) {
			pauseAudio();
		} else {
			playAudio();
		}
	});

	// Toggle mute by settting the gain to 1 or 0 (muted)
	muteBtn.onclick = () => {
		if (!muteBtn.classList.contains("activated")) {
			gainNode.gain.setValueAtTime(0, context.currentTime);
			muteBtn.classList.add("activated");
			muteIcon.style.display = 'block';
			volumeIcon.style.display = 'none';
		} else {
			gainNode.gain.setValueAtTime(1, context.currentTime);
			muteBtn.classList.remove("activated");
			muteIcon.style.display = 'none';
			volumeIcon.style.display = 'block';
		}
	};

	// Allow the user to click somewhere to seek
	seekSlider.addEventListener('input', () => {
		if (isInitialized) {
			currentSample = parseFloat(seekSlider.value) * sampleRate;
			timeDisplay.textContent = `${formatTime(currentSample / sampleRate)} / ${formatTime(duration)}`;
			seekAudio();
		}
	});

	// Allow the user to drag the slider to seek
	seekSlider.addEventListener('change', () => {
		if (isInitialized) {
			currentSample = parseFloat(seekSlider.value) * sampleRate;
			timeDisplay.textContent = `${formatTime(currentSample / sampleRate)} / ${formatTime(duration)}`;
			seekAudio();
		}
	});

	// Load the song and audio player, or error out
	await fetchAndDecodeAudio();

	// On error, kick back to vs code to open as text or binary.
	document.querySelector('.open-file-link')?.addEventListener('click', (e) => {
		e.preventDefault();
		vscode.postMessage({
			type: 'reopen-as-text',
		});
	});
})();
