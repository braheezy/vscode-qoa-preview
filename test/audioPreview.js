(async function () {
    const playPauseBtn = document.querySelector('.play-pause');
    const progressBar = document.querySelector('.progress-bar');
    const progressBarInner = document.querySelector('.progress-bar-inner');
    const timeDisplay = document.querySelector('.time-display');
    const audioContainer = document.querySelector('.audio-container');
    const loadingIndicator = document.querySelector('.loading-indicator');
    const loadingError = document.querySelector('.loading-error');

    let audioBuffer;
    let context;
    let source;
    let isPlaying = false;
    let duration = 0;
    let startTime = 0;
    let currentTime = 0;

    async function fetchAndDecodeAudio() {
        try {
            const response = await fetch('YOUR_AUDIO_FILE.qoa'); // Replace with your QOA file URL
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
            audioContainer.style.display = 'flex';
            document.body.classList.remove('loading');
        } catch (error) {
            console.error('Error processing QOA file:', error);
            loadingError.style.display = 'block';
            document.body.classList.add('error');
        } finally {
            loadingIndicator.style.display = 'none';
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
            playPauseBtn.textContent = 'Play';
        };
        source.start(0, currentTime);
        startTime = context.currentTime - currentTime;
        isPlaying = true;
        playPauseBtn.textContent = 'Pause';
        updateProgress();
    }

    function pauseAudio() {
        if (source) {
            source.stop();
            currentTime += context.currentTime - startTime;
        }
        isPlaying = false;
        playPauseBtn.textContent = 'Play';
    }

    function updateProgress() {
        if (isPlaying) {
            currentTime = context.currentTime - startTime;
            progressBarInner.style.width = `${(currentTime / duration) * 100}%`;
            timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
            if (currentTime < duration) {
                requestAnimationFrame(updateProgress);
            } else {
                isPlaying = false;
                playPauseBtn.textContent = 'Play';
            }
        }
    }

    playPauseBtn.addEventListener('click', () => {
        if (isPlaying) {
            pauseAudio();
        } else {
            playAudio();
        }
    });

    progressBar.addEventListener('click', (e) => {
        const rect = progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        currentTime = (clickX / rect.width) * duration;
        progressBarInner.style.width = `${(currentTime / duration) * 100}%`;
        if (isPlaying) {
            playAudio();
        }
        timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    });

    await fetchAndDecodeAudio();
})();
