import { QOADecoder } from './qoaDecoder.js';  // Adjust the path if necessary

let audioBuffer = null;
let source = null;
let context = null;
let isPlaying = false;
let startTime = 0;
let pauseTime = 0;

async function loadQoaFile() {
    const response = await fetch('./example.qoa');
    const buffer = await response.arrayBuffer();
    console.log("QOA file loaded, decoding");

    const decoder = new QOADecoder();
    const view = new DataView(buffer);
    let pos = 0;
    decoder.readByte = () => (pos < buffer.byteLength ? view.getUint8(pos++) : -1);
    decoder.seekToByte = (position) => { pos = position; };

    if (!decoder.readHeader()) {
        throw new Error("Failed to read QOA file header");
    }

    const channels = decoder.getChannels();
    const sampleRate = decoder.getSampleRate();
    const totalSamples = decoder.getTotalSamples();

    const samples = new Int16Array(totalSamples * channels);
    let sampleIndex = 0;

    while (!decoder.isEnd()) {
        const frameSamples = decoder.readFrame(samples.subarray(sampleIndex));
        if (frameSamples < 0) {
            throw new Error("Failed to read QOA frame");
        }
        sampleIndex += frameSamples * channels;
    }

    return {
        channels,
        sampleRate,
        samples
    };
}

function play(audio) {
    console.log("Starting playback");
    context = new (window.AudioContext || window.webkitAudioContext)();

    audioBuffer = context.createBuffer(
        audio.channels,
        audio.samples.length / audio.channels,
        audio.sampleRate
    );

    for (let i = 0; i < audio.channels; i++) {
        const channelData = new Float32Array(audio.samples.length / audio.channels);
        for (let j = 0; j < channelData.length; j++) {
            channelData[j] = audio.samples[j * audio.channels + i] / 32768;
        }
        audioBuffer.copyToChannel(channelData, i);
    }

    startPlayback();
}

function startPlayback() {
    source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);
    source.start(0, pauseTime);
    startTime = context.currentTime - pauseTime;
    isPlaying = true;
}

function pausePlayback() {
    source.stop();
    pauseTime = context.currentTime - startTime;
    isPlaying = false;
}

function updateSeekBar() {
    if (isPlaying) {
        const elapsed = context.currentTime - startTime;
        document.getElementById('seek-bar').value = elapsed;
        document.getElementById('current-time').textContent = formatTime(elapsed);
    }
    requestAnimationFrame(updateSeekBar);
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

document.getElementById('play-pause').addEventListener('click', async () => {
    console.log("Play/Pause button clicked");
    if (!audioBuffer) {
        const audio = await loadQoaFile();
        play(audio);
    } else {
        if (isPlaying) {
            pausePlayback();
            document.getElementById('play-pause').textContent = 'Play';
        } else {
            startPlayback();
            document.getElementById('play-pause').textContent = 'Pause';
        }
    }
});

document.getElementById('seek-bar').addEventListener('input', (event) => {
    if (audioBuffer) {
        const seekTime = event.target.value;
        if (isPlaying) {
            source.stop();
        }
        pauseTime = seekTime;
        if (isPlaying) {
            startPlayback();
        }
        document.getElementById('current-time').textContent = formatTime(seekTime);
    }
});

audioBuffer && (document.getElementById('seek-bar').max = audioBuffer.duration);

requestAnimationFrame(updateSeekBar);
