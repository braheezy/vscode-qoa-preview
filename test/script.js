const playPauseBtn = document.getElementById('play-pause-btn');
const playIcon = document.getElementById('play-icon');
const pauseIcon = document.getElementById('pause-icon');
const muteBtn = document.getElementById('mute-btn');
const volumeIcon = document.getElementById('volume-icon');
const muteIcon = document.getElementById('mute-icon');
const seekSlider = document.getElementById('seek-slider');
const timeDisplay = document.getElementById('time-display');

let isPlaying = false;
let isMuted = false;
let audio = new Audio('your-audio-file.qoa'); // Replace with your custom audio format

audio.addEventListener('loadedmetadata', () => {
    timeDisplay.textContent = `0:00 / ${formatTime(audio.duration)}`;
    seekSlider.max = audio.duration;
});

audio.addEventListener('timeupdate', () => {
    timeDisplay.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
    seekSlider.value = audio.currentTime;
});

seekSlider.addEventListener('input', () => {
    audio.currentTime = seekSlider.value;
});

playPauseBtn.addEventListener('click', () => {
    if (isPlaying) {
        audio.pause();
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
    } else {
        audio.play();
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
    }
    isPlaying = !isPlaying;
});

muteBtn.addEventListener('click', () => {
    audio.muted = !audio.muted;
    if (audio.muted) {
        volumeIcon.style.display = 'none';
        muteIcon.style.display = 'block';
    } else {
        volumeIcon.style.display = 'block';
        muteIcon.style.display = 'none';
    }
    isMuted = !isMuted;
});

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}
