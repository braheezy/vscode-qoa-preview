import { QOADecoder } from "../qoaDecoder.js";

(async function () {
	const playPauseBtn = document.querySelector('.play-pause');
	const seekSlider = document.querySelector('.seek-slider');
	const timeDisplay = document.querySelector('.time-display');
	const playIcon = document.getElementById('play-icon');
	const pauseIcon = document.getElementById('pause-icon');

	let audioBuffer;
	let context;
	let source;
	let isPlaying = false;
	let duration = 0;
	let startTime = 0;
	let currentTime = 0;
	let animationFrameId;

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
			const sampleRate = decoder.getSampleRate();
			const totalSamples = decoder.getTotalSamples();

			const samples = new Int16Array(totalSamples * channels);
			let sampleIndex = 0;

			while (!decoder.isEnd()) {
				const frameSamples = decoder.readFrame(samples.subarray(sampleIndex));
				if (frameSamples < 0) {
					throw new Error('Failed to read QOA frame');
				}
				sampleIndex += frameSamples * channels;
			}

			context = new AudioContext();
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

		} catch (error) {
			console.error('Error processing QOA file:', error);
		}
	}

	function formatTime(seconds) {
		const minutes = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
	}

	function playAudio() {
		if (source) {
			source.stop();
		}
		source = context.createBufferSource();
		source.buffer = audioBuffer;
		source.connect(context.destination);
		source.onended = () => {
			isPlaying = false;
			playIcon.style.display = 'block';
			pauseIcon.style.display = 'none';
			currentTime = 0;
			seekSlider.value = 0;
			cancelAnimationFrame(animationFrameId);
		};
		source.start(0, currentTime);
		startTime = context.currentTime - currentTime;
		isPlaying = true;
		playIcon.style.display = 'none';
		pauseIcon.style.display = 'block';
		updateProgress();
	}

	function pauseAudio() {
		if (source) {
			source.playbackRate.value = 0;
			currentTime += context.currentTime - startTime;
		}
		isPlaying = false;
		playIcon.style.display = 'block';
		pauseIcon.style.display = 'none';
		cancelAnimationFrame(animationFrameId);
	}

	function updateProgress() {
		if (isPlaying) {
			currentTime = context.currentTime - startTime;
			seekSlider.value = currentTime;
			timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
			animationFrameId = requestAnimationFrame(updateProgress);
		}
	}

	playPauseBtn.addEventListener('click', () => {
		if (isPlaying) {
			pauseAudio();
		} else {
			playAudio();
		}
	});

	seekSlider.addEventListener('input', () => {
		currentTime = parseFloat(seekSlider.value);
		timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
		if (isPlaying) {
			source.stop();
			playAudio();
		}
	});

	seekSlider.addEventListener('change', () => {
		currentTime = parseFloat(seekSlider.value);
		timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
		if (isPlaying) {
			source.stop();
			playAudio();
		} else {
			context.resume().then(() => {
				startTime = context.currentTime - currentTime;
				source.start(0, currentTime);
			});
		}
	});

	await fetchAndDecodeAudio();
})();
