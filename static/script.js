// Utility: format seconds to mm:ss
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins + ':' + (secs < 10 ? '0' + secs : secs);
}

let wavesurferOriginal;
let wavesurferVocal;
let currentWave;
let isDragging = false;

// DOM element references
const playerSection      = document.getElementById('player');
const browseBtn          = document.getElementById('browse-btn');
const fileInput          = document.getElementById('file-input');
const separateBtn        = document.getElementById('separate-btn');
const progressBar        = document.getElementById('progress-bar');
const progressFill       = document.getElementById('progress-fill');
const progressText       = document.getElementById('progress-text');
const progressPercText   = document.getElementById('progress-percentage');
const btnOriginal        = document.getElementById('btn-original');
const btnVocal           = document.getElementById('btn-vocal');
const playBtn            = document.getElementById('play-btn');
const currentTimeEl      = document.getElementById('current-time');
const totalTimeEl        = document.getElementById('total-time');
const timeline           = document.getElementById('timeline');
const downloadVocalLink  = document.getElementById('download-vocal');
const downloadInstLink   = document.getElementById('download-inst');
const downloadLinksSec   = document.getElementById('download-links');
const uploadSection      = document.getElementById('upload-section');

// Browse button opens file dialog
browseBtn.addEventListener('click', () => fileInput.click());

// Drag & drop visual feedback
uploadSection.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadSection.classList.add('bg-gray-100');
});
uploadSection.addEventListener('dragleave', (e) => {
  e.preventDefault();
  uploadSection.classList.remove('bg-gray-100');
});
uploadSection.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadSection.classList.remove('bg-gray-100');
  if (e.dataTransfer.files.length) {
    fileInput.files = e.dataTransfer.files;
    handleFileSelect();
  }
});

// When a file is selected
fileInput.addEventListener('change', handleFileSelect);
function handleFileSelect() {
  const file = fileInput.files[0];
  if (!file) return;
  // Show player controls section
  playerSection.style.display = 'flex';
  // If a waveform already exists, destroy it
  if (wavesurferOriginal) wavesurferOriginal.destroy();
  // Initialize WaveSurfer for original track
  wavesurferOriginal = WaveSurfer.create({
    container: '#waveform-original',
    waveColor: '#3b82f6',      // Tailwind blue-500
    progressColor: '#60a5fa',  // Tailwind blue-400
    cursorColor: '#3b82f6',
    height: 128,
    normalize: true
  });
  wavesurferOriginal.loadBlob(file);
  // Enable the Separate button now that a file is loaded
  separateBtn.disabled = false;
  separateBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  // Reset any previous progress or results
  progressBar.style.display = 'none';
  progressText.style.display = 'none';
  downloadLinksSec.style.display = 'none';
  // Reset toggle buttons to default state (Original active, Vocal disabled)
  btnVocal.disabled = true;
  btnVocal.classList.add('opacity-50', 'cursor-not-allowed');
  btnOriginal.classList.add('bg-blue-500', 'text-white');
  btnOriginal.classList.remove('bg-gray-300', 'text-gray-700');
  btnVocal.classList.add('bg-gray-300', 'text-gray-700');
  btnVocal.classList.remove('bg-blue-500', 'text-white');
  // Wavesurfer event bindings for original track
  wavesurferOriginal.on('ready', () => {
    currentWave = wavesurferOriginal;
    totalTimeEl.textContent = formatTime(wavesurferOriginal.getDuration());
    currentTimeEl.textContent = '0:00';
    timeline.value = 0;
  });
  wavesurferOriginal.on('audioprocess', () => {
    if (!isDragging) {
      const currentTime = wavesurferOriginal.getCurrentTime();
      const duration = wavesurferOriginal.getDuration();
      if (duration > 0) {
        const percent = (currentTime / duration) * 100;
        timeline.value = percent;
      }
      currentTimeEl.textContent = formatTime(currentTime);
    }
  });
  wavesurferOriginal.on('seek', (progress) => {
    const time = wavesurferOriginal.getCurrentTime();
    currentTimeEl.textContent = formatTime(time);
    timeline.value = progress * 100;
  });
  wavesurferOriginal.on('play', () => {
    playBtn.textContent = 'Pause';
  });
  wavesurferOriginal.on('pause', () => {
    playBtn.textContent = 'Play';
  });
  wavesurferOriginal.on('finish', () => {
    playBtn.textContent = 'Play';
    timeline.value = 100;
    currentTimeEl.textContent = formatTime(wavesurferOriginal.getDuration());
  });
}

// When the Separate button is clicked
separateBtn.addEventListener('click', () => {
  if (!fileInput.files[0]) return;
  // Disable file controls during processing
  separateBtn.disabled = true;
  browseBtn.disabled = true;
  separateBtn.classList.add('opacity-50', 'cursor-not-allowed');
  browseBtn.classList.add('opacity-50', 'cursor-not-allowed');
  // Show progress indicators
  progressBar.style.display = 'block';
  progressText.style.display = 'block';
  progressPercText.textContent = '0';
  progressFill.style.width = '0%';
  progressText.innerHTML = 'Processing: <span id="progress-percentage">0</span>%';
  // Prepare form data for file upload
  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  // Fetch the `/separate` endpoint and stream results
  fetch('/separate', { method: 'POST', body: formData })
    .then(response => {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let partial = '';
      // Read streaming data chunks
      function readStream() {
        reader.read().then(({ done, value }) => {
          if (done) return;  // finished streaming
          partial += decoder.decode(value, { stream: true });
          // Split the stream by SSE message delimiter
          let messages = partial.split('\n\n');
          partial = messages.pop();  // preserve incomplete message
          for (let msg of messages) {
            if (msg.startsWith('data:')) {
              const data = msg.slice(5).trim();
              if (data.startsWith('DONE|')) {
                // Separation completed
                const parts = data.split('|');
                const vocFile = parts[1];
                const instFile = parts[2];
                // Initialize WaveSurfer for vocal track
                if (wavesurferVocal) wavesurferVocal.destroy();
                wavesurferVocal = WaveSurfer.create({
                  container: '#waveform-vocal',
                  waveColor: '#9333ea',      // Tailwind purple-500
                  progressColor: '#c084fc',  // Tailwind purple-300
                  cursorColor: '#9333ea',
                  height: 128,
                  normalize: true
                });
                wavesurferVocal.load('/download/' + encodeURIComponent(vocFile));
                // Bind events for vocal track
                wavesurferVocal.on('ready', () => {
                  // Keep currentWave as original by default (will switch on toggle)
                  totalTimeEl.textContent = formatTime(wavesurferVocal.getDuration());
                  // Enable the Vocal toggle button now that vocal track is ready
                  btnVocal.disabled = false;
                  btnVocal.classList.remove('opacity-50', 'cursor-not-allowed');
                });
                wavesurferVocal.on('audioprocess', () => {
                  if (!isDragging) {
                    const currentTime = wavesurferVocal.getCurrentTime();
                    const duration = wavesurferVocal.getDuration();
                    if (duration > 0) {
                      const percent = (currentTime / duration) * 100;
                      timeline.value = percent;
                    }
                    currentTimeEl.textContent = formatTime(currentTime);
                  }
                });
                wavesurferVocal.on('seek', (progress) => {
                  const time = wavesurferVocal.getCurrentTime();
                  currentTimeEl.textContent = formatTime(time);
                  timeline.value = progress * 100;
                });
                wavesurferVocal.on('play', () => {
                  playBtn.textContent = 'Pause';
                });
                wavesurferVocal.on('pause', () => {
                  playBtn.textContent = 'Play';
                });
                wavesurferVocal.on('finish', () => {
                  playBtn.textContent = 'Play';
                  timeline.value = 100;
                  currentTimeEl.textContent = formatTime(wavesurferVocal.getDuration());
                });
                // Show download links for results
                downloadVocalLink.href = '/download/' + encodeURIComponent(vocFile);
                downloadInstLink.href = '/download/' + encodeURIComponent(instFile);
                downloadLinksSec.style.display = 'block';
                // Re-enable file selection button for a new upload if needed
                browseBtn.disabled = false;
                browseBtn.classList.remove('opacity-50', 'cursor-not-allowed');
              } else if (data === 'ERROR') {
                // Separation failed
                progressFill.style.width = '0%';
                progressPercText.textContent = '0';
                progressText.textContent = 'Separation failed. Please check the logs.';
                // Re-enable controls to allow retry
                separateBtn.disabled = false;
                browseBtn.disabled = false;
                separateBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                browseBtn.classList.remove('opacity-50', 'cursor-not-allowed');
              } else {
                // Update progress percentage
                const percent = parseInt(data);
                if (!isNaN(percent)) {
                  progressPercText.textContent = percent;
                  progressFill.style.width = percent + '%';
                }
              }
            }
          }
          readStream();  // continue reading next chunk
        });
      }
      readStream();
    });
});

// Toggle between Original and Vocal waveforms
btnOriginal.addEventListener('click', () => {
  if (btnOriginal.disabled) return;
  if (currentWave !== wavesurferOriginal) {
    // Pause vocal track if it was playing
    let wasPlaying = false;
    let currentTime = 0;
    if (wavesurferVocal && wavesurferVocal.isPlaying()) {
      wasPlaying = true;
      currentTime = wavesurferVocal.getCurrentTime();
      wavesurferVocal.pause();
    } else if (wavesurferVocal) {
      currentTime = wavesurferVocal.getCurrentTime();
    }
    // Switch waveform display: show original, hide vocal
    document.getElementById('waveform-original').classList.remove('opacity-0', 'pointer-events-none');
    document.getElementById('waveform-vocal').classList.add('opacity-0', 'pointer-events-none');
    currentWave = wavesurferOriginal;
    // Seek original to the same time position (if durations match)
    if (currentTime) {
      const dur = wavesurferOriginal.getDuration();
      if (dur > 0) {
        wavesurferOriginal.seekTo(Math.min(currentTime / dur, 1));
      }
    }
    // Update toggle button styles
    btnOriginal.classList.add('bg-blue-500', 'text-white');
    btnOriginal.classList.remove('bg-gray-300', 'text-gray-700');
    btnVocal.classList.add('bg-gray-300', 'text-gray-700');
    btnVocal.classList.remove('bg-blue-500', 'text-white');
    // Resume playback if it was playing when toggled
    if (wasPlaying) {
      wavesurferOriginal.play();
    }
  }
});
btnVocal.addEventListener('click', () => {
  if (btnVocal.disabled) return;
  if (currentWave !== wavesurferVocal) {
    let wasPlaying = false;
    let currentTime = 0;
    if (wavesurferOriginal.isPlaying()) {
      wasPlaying = true;
      currentTime = wavesurferOriginal.getCurrentTime();
      wavesurferOriginal.pause();
    } else {
      currentTime = wavesurferOriginal.getCurrentTime();
    }
    // Switch waveform display: show vocal, hide original
    document.getElementById('waveform-original').classList.add('opacity-0', 'pointer-events-none');
    document.getElementById('waveform-vocal').classList.remove('opacity-0', 'pointer-events-none');
    currentWave = wavesurferVocal;
    // Seek vocal track to the corresponding time
    if (currentTime) {
      const dur = wavesurferVocal.getDuration();
      if (dur > 0) {
        wavesurferVocal.seekTo(Math.min(currentTime / dur, 1));
      }
    }
    // Update toggle button styles
    btnVocal.classList.add('bg-blue-500', 'text-white');
    btnVocal.classList.remove('bg-gray-300', 'text-gray-700');
    btnOriginal.classList.add('bg-gray-300', 'text-gray-700');
    btnOriginal.classList.remove('bg-blue-500', 'text-white');
    // If audio was playing, continue playing the vocal track
    if (wasPlaying) {
      wavesurferVocal.play();
    }
  }
});

// Play/Pause button control
playBtn.addEventListener('click', () => {
  if (!currentWave) return;
  currentWave.playPause();
});

// Timeline slider interactions for seeking
timeline.addEventListener('input', (e) => {
  if (!currentWave) return;
  isDragging = true;
  const percent = Number(e.target.value);
  const duration = currentWave.getDuration();
  if (duration) {
    const newTime = (percent / 100) * duration;
    currentTimeEl.textContent = formatTime(newTime);
  }
});
timeline.addEventListener('change', (e) => {
  if (!currentWave) return;
  const percent = Number(e.target.value);
  currentWave.seekTo(percent / 100);
  isDragging = false;
});
