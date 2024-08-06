import { QOADecoder } from "../qoaDecoder.js";

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
	let currentTime = 0;
	let animationFrameId;
	let sampleRate;
	let totalSamples;
	let currentSample = 0;
	let isSeeking = false;
	let isInitialized = false;
	let pauseTime = 0; // Time when paused


	// @ts-ignore
	const vscode = acquireVsCodeApi();

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


	async function fetchAndDecodeAudio() {
		try {
			const response = await fetch(settings.src); // Replace with your QOA file URL
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
		}
	}

	function formatTime(seconds) {
		const minutes = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
	}

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

	function playAudio() {
		if (context.state === 'suspended' && isInitialized) {
			context.resume();
			startTime = context.currentTime - pauseTime; // Resume from the paused time
			isPlaying = true;
			playIcon.style.display = 'none';
			pauseIcon.style.display = 'block';
			updateProgress();
			return;
		}

		if (!isInitialized) {
			createSource();
			source.start(0, currentSample / sampleRate);
			startTime = context.currentTime;
			isPlaying = true;
			playIcon.style.display = 'none';
			pauseIcon.style.display = 'block';
			updateProgress();
			isInitialized = true;
		} else {
			createSource();
			source.start(0, currentSample / sampleRate);
			startTime = context.currentTime - (currentSample / sampleRate);
			isPlaying = true;
			playIcon.style.display = 'none';
			pauseIcon.style.display = 'block';
			updateProgress();
		}
	}

	function pauseAudio() {
		if (context.state === 'running') {
			context.suspend();
			pauseTime = context.currentTime - startTime; // Save the pause time
			isPlaying = false;
			playIcon.style.display = 'block';
			pauseIcon.style.display = 'none';
			cancelAnimationFrame(animationFrameId);
		}
	}

	function updateProgress() {
		if (isPlaying) {
			const elapsed = context.currentTime - startTime;
			currentSample = elapsed * sampleRate;
			const progress = (elapsed / duration) * 100;
			seekSlider.value = elapsed;
			seekSlider.style.setProperty('--seek-before-width', `${progress}%`); // Update progress bar
			timeDisplay.textContent = `${formatTime(elapsed)} / ${formatTime(duration)}`;
			animationFrameId = requestAnimationFrame(updateProgress);
		}
	}
	function seekAudio() {
		const seekTime = currentSample / sampleRate; // Calculate the seek time
		source.disconnect()
		createSource();
		source.start(0, seekTime);
		if (isPlaying) {
			startTime = context.currentTime - seekTime; // Adjust start time based on seek time
		} else {
			pauseTime = seekTime; // Adjust pause time based on seek time if not playing
		}
	}

	playPauseBtn.addEventListener('click', () => {
		if (isPlaying) {
			pauseAudio();
		} else {
			playAudio();
		}
	});

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


	seekSlider.addEventListener('input', () => {
		currentSample = parseFloat(seekSlider.value) * sampleRate;
		timeDisplay.textContent = `${formatTime(currentSample / sampleRate)} / ${formatTime(duration)}`;
		if (isPlaying) {
			seekAudio();
		}
	});

	seekSlider.addEventListener('change', () => {
		if (isPlaying) {
			currentSample = parseFloat(seekSlider.value) * sampleRate;
			timeDisplay.textContent = `${formatTime(currentSample / sampleRate)} / ${formatTime(duration)}`;
			seekAudio();
		}
	});

	await fetchAndDecodeAudio();
})();
