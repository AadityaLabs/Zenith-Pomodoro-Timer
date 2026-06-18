class AmbientEngine {
    constructor() {
        this.ctx = null;
        this.sources = {};
        this.gains = {};
        this.isPlaying = {};
    }

    init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.setupBinauralHum();
        this.setupRainSource();
        this.setupCelestialDrift();
    }

    setupBinauralHum() {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        const gain2 = this.ctx.createGain();
        osc1.frequency.setValueAtTime(100, this.ctx.currentTime);
        osc2.frequency.setValueAtTime(104, this.ctx.currentTime);
        const merger = this.ctx.createChannelMerger(2);
        osc1.connect(gain1).connect(merger, 0, 0);
        osc2.connect(gain2).connect(merger, 0, 1);
        const masterGain = this.ctx.createGain();
        merger.connect(masterGain);
        osc1.type = 'sine';
        osc2.type = 'sine';
        this.sources['focus'] = { osc1, osc2, masterGain };
        this.gains['focus'] = masterGain;
        this.isPlaying['focus'] = false;
    }

    setupRainSource() {
        const bufferSize = 2 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            output[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = output[i];
            output[i] *= 3.5;
        }
        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = noiseBuffer;
        noiseNode.loop = true;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 850;
        const masterGain = this.ctx.createGain();
        noiseNode.connect(filter).connect(masterGain);
        this.sources['rain'] = { noiseNode };
        this.gains['rain'] = masterGain;
        this.isPlaying['rain'] = false;
    }

    setupCelestialDrift() {
        const osc = this.ctx.createOscillator();
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, this.ctx.currentTime);
        lfo.frequency.setValueAtTime(0.15, this.ctx.currentTime);
        lfoGain.gain.setValueAtTime(30, this.ctx.currentTime);
        lfo.connect(lfoGain).connect(osc.frequency);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(350, this.ctx.currentTime);
        const masterGain = this.ctx.createGain();
        osc.connect(filter).connect(masterGain);
        this.sources['drift'] = { osc, lfo, masterGain };
        this.gains['drift'] = masterGain;
        this.isPlaying['drift'] = false;
    }

    toggleSound(name, volume) {
        this.init();
        if (this.isPlaying[name]) {
            this.gains[name].disconnect(this.ctx.destination);
            this.isPlaying[name] = false;
            return false;
        } else {
            this.gains[name].gain.setValueAtTime(volume, this.ctx.currentTime);
            this.gains[name].connect(this.ctx.destination);
            if (name === 'focus') {
                this.setupBinauralHum();
                this.sources.focus.osc1.start();
                this.sources.focus.osc2.start();
                this.gains.focus.connect(this.ctx.destination);
            } else if (name === 'rain') {
                this.setupRainSource();
                this.sources.rain.noiseNode.start();
                this.gains.rain.connect(this.ctx.destination);
            } else if (name === 'drift') {
                this.setupCelestialDrift();
                this.sources.drift.osc.start();
                this.sources.drift.lfo.start();
                this.gains.drift.connect(this.ctx.destination);
            }
            this.isPlaying[name] = true;
            return true;
        }
    }

    setVolume(name, volume) {
        if (this.gains[name]) {
            this.gains[name].gain.setValueAtTime(volume, this.ctx.currentTime);
        }
    }

    playTick(tickingEnabled) {
        if (!tickingEnabled || !this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gainNode = this.ctx.createGain();
            osc.connect(gainNode).connect(this.ctx.destination);
            osc.frequency.setValueAtTime(680, this.ctx.currentTime);
            gainNode.gain.setValueAtTime(0.005, this.ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.00001, this.ctx.currentTime + 0.04);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.05);
        } catch (e) {
            // Fail silently
        }
    }

    playSessionChime() {
        this.init();
        const now = this.ctx.currentTime;
        const freqs = [329.63, 440, 554.37, 659.25, 880];
        freqs.forEach((f, index) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = f;
            gain.gain.setValueAtTime(0.06 / freqs.length, now);
            gain.gain.exponentialRampToValueAtTime(0.00001, now + 2.5 - (index * 0.2));
            osc.connect(gain).connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 3);
        });
    }
}

const ambientEngine = new AmbientEngine();

const AppState = {
    timer: {
        pomodoro: 25,
        short: 5,
        long: 15,
        currentMinutes: 25,
        currentSeconds: 0,
        totalDurationSeconds: 25 * 60,
        isRunning: false,
        currentMode: 'pomodoro',
        timerInterval: null,
    },
    automation: {
        autoStartBreaks: false,
        autoStartPomodoros: false,
        tickingAudioPulse: false,
    },
    history: [],
    stats: {
        dailyCompleted: 0,
        totalMinutes: 0,
        streak: 1
    },
    tasks: [],
    activeTaskIndex: -1,
    ui: {
        isDark: false
    }
};

const ZEN_QUOTES = [
    "Flow is the art of directing your thoughts to a singular focal point, releasing the turbulence of the external universe.",
    "Simplicity is the ultimate sophistication. Let go of the trivial; anchor your consciousness.",
    "Within peace, clarity rises naturally. Your mind is like water: when calm, it reflects beauty clearly.",
    "Great work is built from quiet moments of deep commitment. Cherish this silence.",
    "The secret of constant momentum is small, focused intervals of presence."
];

const canvas = document.getElementById('particle-canvas');
const ctx = canvas.getContext('2d');
let particles = [];
let animationFrameId = null;

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}

class Particle3D {
    constructor(centerX, centerY) {
        this.centerX = centerX;
        this.centerY = centerY;
        this.reset();
    }

    reset() {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        const r = 90 + Math.random() * 30;
        this.x3d = r * Math.sin(phi) * Math.cos(theta);
        this.y3d = r * Math.sin(phi) * Math.sin(theta);
        this.z3d = r * Math.cos(phi);
        this.size = Math.random() * 1.5 + 0.8;
        this.speed = (Math.random() * 0.01 + 0.005);
    }

    update(isRunning, currentMode) {
        let multiplier = 1.0;
        if (!isRunning) {
            multiplier = 0.25;
        } else if (currentMode === 'pomodoro') {
            multiplier = 2.2;
        } else {
            multiplier = 0.6;
        }
        const angle = this.speed * multiplier;
        let cosY = Math.cos(angle);
        let sinY = Math.sin(angle);
        let y1 = this.y3d * cosY - this.z3d * sinY;
        let z1 = this.z3d * cosY + this.y3d * sinY;
        let cosX = Math.cos(angle * 0.5);
        let sinX = Math.sin(angle * 0.5);
        let x2 = this.x3d * cosX - z1 * sinX;
        let z2 = z1 * cosX + this.x3d * sinX;
        this.x3d = x2;
        this.y3d = y1;
        this.z3d = z2;
    }

    draw(ctx, accentColor) {
        const perspective = 250;
        const scale = perspective / (perspective + this.z3d);
        const projX = this.centerX + this.x3d * scale;
        const projY = this.centerY + this.y3d * scale;
        const baseAlpha = 0.15 + ((this.z3d + 120) / 240) * 0.65;
        ctx.beginPath();
        ctx.arc(projX, projY, this.size * scale, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${accentColor}, ${baseAlpha})`;
        ctx.fill();
    }
}

function initParticles() {
    particles = [];
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    for (let i = 0; i < 150; i++) {
        particles.push(new Particle3D(cx, cy));
    }
}

function getAccentColorRGB() {
    const mode = AppState.timer.currentMode;
    if (mode === 'pomodoro') return '226, 92, 61';
    if (mode === 'short') return '90, 138, 119';
    return '79, 112, 156';
}

function animate() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    const rgb = getAccentColorRGB();
    particles.forEach(p => {
        p.update(AppState.timer.isRunning, AppState.timer.currentMode);
        p.draw(ctx, rgb);
    });
    animationFrameId = requestAnimationFrame(animate);
}

const timerCard = document.getElementById('timer-card');

timerCard.addEventListener('mousemove', (e) => {
    const rect = timerCard.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const rotateX = -(y / (rect.height / 2)) * 10;
    const rotateY = (x / (rect.width / 2)) * 10;
    timerCard.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.01, 1.01, 1.01)`;
});

timerCard.addEventListener('mouseleave', () => {
    timerCard.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
});

const themeToggleBtn = document.getElementById('theme-toggle');

function updateTheme() {
    if (AppState.ui.isDark) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('zenith_dark_mode', AppState.ui.isDark);
}

themeToggleBtn.addEventListener('click', () => {
    AppState.ui.isDark = !AppState.ui.isDark;
    updateTheme();
});

const tabs = document.querySelectorAll('.mode-tab-btn');
const tabIndicator = document.getElementById('tab-indicator');

function updateTabIndicator(activeTab) {
    tabIndicator.style.left = `${activeTab.offsetLeft}px`;
    tabIndicator.style.width = `${activeTab.offsetWidth}px`;
    tabs.forEach(tab => {
        tab.classList.remove('text-focus', 'text-short', 'text-long', 'font-bold', 'text-cream-900', 'dark:text-white');
        tab.classList.add('text-cream-300', 'dark:text-zinc-500');
    });
    const activeMode = activeTab.dataset.mode;
    activeTab.classList.remove('text-cream-300', 'dark:text-zinc-500');
    activeTab.classList.add('font-bold', 'text-cream-900', 'dark:text-white');
    if (activeMode === 'pomodoro') {
        activeTab.classList.add('text-focus');
    } else if (activeMode === 'short') {
        activeTab.classList.add('text-short');
    } else {
        activeTab.classList.add('text-long');
    }
}

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        switchMode(tab.dataset.mode);
    });
});

function switchMode(mode, silent = false) {
    AppState.timer.currentMode = mode;
    const cardElement = document.getElementById('timer-card');
    const progressRing = document.getElementById('radial-progress');
    const statusText = document.getElementById('timer-status-text');
    cardElement.className = 'tilt-card relative w-full max-w-[420px] aspect-[1/1.1] bg-white/70 dark:bg-obsidian-800/50 border border-cream-200/80 dark:border-zinc-800/80 rounded-[48px] p-8 flex flex-col justify-between items-center backdrop-blur-3xl transition-all duration-700 ';
    progressRing.className = 'fill-none transition-all duration-300 ';
    if (mode === 'pomodoro') {
        cardElement.classList.add('focus-glow-orange');
        progressRing.classList.add('text-focus');
        statusText.innerText = 'Deepening';
        statusText.style.color = '#E25C3D';
    } else if (mode === 'short') {
        cardElement.classList.add('focus-glow-green');
        progressRing.classList.add('text-short');
        statusText.innerText = 'Resting State';
        statusText.style.color = '#5A8A77';
    } else if (mode === 'long') {
        cardElement.classList.add('focus-glow-blue');
        progressRing.classList.add('text-long');
        statusText.innerText = 'Internal Balance';
        statusText.style.color = '#4F709C';
    }
    AppState.timer.currentMinutes = AppState.timer[mode];
    AppState.timer.currentSeconds = 0;
    AppState.timer.totalDurationSeconds = AppState.timer[mode] * 60;
    const matchingTab = document.querySelector(`.mode-tab-btn[data-mode="${mode}"]`);
    updateTabIndicator(matchingTab);
    pauseTimer();
    updateTimerDisplay();
    if (!silent) {
        if (mode === 'pomodoro' && AppState.automation.autoStartPomodoros) {
            startTimer();
        } else if ((mode === 'short' || mode === 'long') && AppState.automation.autoStartBreaks) {
            startTimer();
        }
    }
}

const minutesDisplay = document.getElementById('timer-minutes');
const secondsDisplay = document.getElementById('timer-seconds');
const radialProgress = document.getElementById('radial-progress');

function updateTimerDisplay() {
    const formattedMinutes = String(AppState.timer.currentMinutes).padStart(2, '0');
    const formattedSeconds = String(AppState.timer.currentSeconds).padStart(2, '0');
    minutesDisplay.innerText = formattedMinutes;
    secondsDisplay.innerText = formattedSeconds;
    const modeChar = AppState.timer.currentMode === 'pomodoro' ? '🎯' : '☕';
    document.title = `${formattedMinutes}:${formattedSeconds} ${modeChar} Zenith`;
    const elapsedSeconds = (AppState.timer.currentMinutes * 60) + AppState.timer.currentSeconds;
    const totalSec = AppState.timer.totalDurationSeconds;
    const progressRatio = totalSec > 0 ? (elapsedSeconds / totalSec) : 0;
    const dashOffset = 276.46 * (1 - progressRatio);
    radialProgress.style.strokeDashoffset = dashOffset;
}

const playPauseBtn = document.getElementById('play-pause-btn');
const playIcon = document.getElementById('play-icon');
const playText = document.getElementById('play-text');

function startTimer() {
    if (AppState.timer.isRunning) return;
    AppState.timer.isRunning = true;
    playIcon.setAttribute('data-lucide', 'pause');
    lucide.createIcons();
    playText.innerText = 'Suspend';
    AppState.timer.timerInterval = setInterval(() => {
        if (AppState.timer.currentSeconds === 0) {
            if (AppState.timer.currentMinutes === 0) {
                resolveSession();
                return;
            }
            AppState.timer.currentMinutes--;
            AppState.timer.currentSeconds = 59;
        } else {
            AppState.timer.currentSeconds--;
        }
        ambientEngine.playTick(AppState.automation.tickingAudioPulse);
        updateTimerDisplay();
    }, 1000);
}

function pauseTimer() {
    if (!AppState.timer.isRunning) return;
    AppState.timer.isRunning = false;
    clearInterval(AppState.timer.timerInterval);
    playIcon.setAttribute('data-lucide', 'play');
    lucide.createIcons();
    playText.innerText = 'Begin';
}

function resolveSession() {
    pauseTimer();
    ambientEngine.playSessionChime();
    const logMode = AppState.timer.currentMode;
    const duration = AppState.timer[logMode];
    if (logMode === 'pomodoro') {
        AppState.stats.dailyCompleted++;
        AppState.stats.totalMinutes += duration;
        const randomIndex = Math.floor(Math.random() * ZEN_QUOTES.length);
        document.getElementById('focus-quote').innerText = `"${ZEN_QUOTES[randomIndex]}"`;
        logSessionToHistory('Focus Integration Session', duration, 'pomodoro');
    } else {
        logSessionToHistory(logMode === 'short' ? 'Brief Recovery Cycle' : 'Deep System Grounding', duration, logMode);
    }
    updateAnalyticsUI();
    saveStats();
    if (logMode === 'pomodoro') {
        if (AppState.stats.dailyCompleted % 4 === 0) {
            switchMode('long');
        } else {
            switchMode('short');
        }
    } else {
        switchMode('pomodoro');
    }
}

playPauseBtn.addEventListener('click', () => {
    playPauseBtn.classList.add('animate-pop');
    setTimeout(() => playPauseBtn.classList.remove('animate-pop'), 300);
    if (AppState.timer.isRunning) {
        pauseTimer();
    } else {
        startTimer();
    }
});

document.getElementById('reset-btn').addEventListener('click', () => {
    switchMode(AppState.timer.currentMode, true);
});

document.getElementById('skip-btn').addEventListener('click', () => {
    if (AppState.timer.currentMode === 'pomodoro') {
        if (AppState.stats.dailyCompleted % 4 === 0 && AppState.stats.dailyCompleted > 0) {
            switchMode('long');
        } else {
            switchMode('short');
        }
    } else {
        switchMode('pomodoro');
    }
});

const taskInput = document.getElementById('task-input');
const taskAddBtn = document.getElementById('task-add-btn');
const taskListContainer = document.getElementById('task-list');
const taskCounter = document.getElementById('task-counter');

function renderTasks() {
    taskListContainer.innerHTML = '';
    if (AppState.tasks.length === 0) {
        taskListContainer.innerHTML = `<div class="text-center py-6 text-xs text-cream-300 dark:text-zinc-500 italic">No tasks on deck. Anchor your mind.</div>`;
        taskCounter.innerText = '0/0';
        return;
    }
    let completedCount = 0;
    AppState.tasks.forEach((task, index) => {
        if (task.completed) completedCount++;
        const taskEl = document.createElement('div');
        taskEl.className = `flex items-center justify-between p-3 rounded-2xl border transition-all duration-300 ${task.completed ? 'bg-cream-100/30 dark:bg-zinc-900/10 border-transparent opacity-60' : 'bg-white dark:bg-zinc-900/40 border-cream-200/40 dark:border-zinc-800/40'}`;
        taskEl.innerHTML = `
            <div class="flex items-center gap-2.5 flex-1 cursor-pointer" onclick="toggleTaskCompletion(${index})">
                <button class="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${task.completed ? 'bg-focus border-focus text-white' : 'border-cream-300 dark:border-zinc-700'}" id="check-btn-${index}">
                    ${task.completed ? '<i data-lucide="check" class="w-3 h-3"></i>' : ''}
                </button>
                <span class="text-xs font-medium transition-all ${task.completed ? 'line-through text-cream-300 dark:text-zinc-500' : 'text-cream-900 dark:text-zinc-100'}">${task.text}</span>
            </div>
            <button class="p-1 hover:text-rose-500 text-cream-300 dark:text-zinc-500 transition-colors" onclick="deleteTask(event, ${index})">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        `;
        taskListContainer.appendChild(taskEl);
    });
    taskCounter.innerText = `${completedCount}/${AppState.tasks.length}`;
    lucide.createIcons();
}

window.toggleTaskCompletion = function(index) {
    AppState.tasks[index].completed = !AppState.tasks[index].completed;
    saveTasks();
    renderTasks();
};

window.deleteTask = function(event, index) {
    event.stopPropagation();
    AppState.tasks.splice(index, 1);
    saveTasks();
    renderTasks();
};

function addTask() {
    const text = taskInput.value.trim();
    if (!text) return;
    AppState.tasks.push({ text, completed: false });
    taskInput.value = '';
    saveTasks();
    renderTasks();
}

taskAddBtn.addEventListener('click', addTask);
taskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTask();
});

const soundButtons = document.querySelectorAll('.sound-toggle-btn');
const soundSliders = document.querySelectorAll('input[type="range"]');

soundButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const soundName = btn.dataset.sound;
        const associatedSlider = Array.from(soundSliders).find(s => s.dataset.sound === soundName);
        const isPlayingNow = ambientEngine.toggleSound(soundName, parseFloat(associatedSlider.value));
        if (isPlayingNow) {
            btn.classList.add('bg-focus/10', 'border-focus/30');
            btn.querySelector('i').classList.add('text-focus');
        } else {
            btn.classList.remove('bg-focus/10', 'border-focus/30');
            btn.querySelector('i').classList.remove('text-focus');
        }
    });
});

soundSliders.forEach(slider => {
    slider.addEventListener('input', (e) => {
        const soundName = slider.dataset.sound;
        ambientEngine.setVolume(soundName, parseFloat(e.target.value));
    });
});

const settingsPanel = document.getElementById('settings-panel');
const settingsOpenBtn = document.getElementById('settings-toggle-btn');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const settingsSaveBtn = document.getElementById('settings-save-btn');

const inputPomo = document.getElementById('input-pomo');
const inputShort = document.getElementById('input-short');
const inputLong = document.getElementById('input-long');
const autoBreakToggle = document.getElementById('auto-break-toggle');
const autoPomoToggle = document.getElementById('auto-pomo-toggle');
const tickingToggle = document.getElementById('ticking-toggle');

function openSettings() {
    inputPomo.value = AppState.timer.pomodoro;
    inputShort.value = AppState.timer.short;
    inputLong.value = AppState.timer.long;
    autoBreakToggle.checked = AppState.automation.autoStartBreaks;
    autoPomoToggle.checked = AppState.automation.autoStartPomodoros;
    tickingToggle.checked = AppState.automation.tickingAudioPulse;
    settingsPanel.classList.remove('translate-x-full');
}

function closeSettings() {
    settingsPanel.classList.add('translate-x-full');
}

settingsOpenBtn.addEventListener('click', openSettings);
settingsCloseBtn.addEventListener('click', closeSettings);

settingsSaveBtn.addEventListener('click', () => {
    AppState.timer.pomodoro = Math.max(1, parseInt(inputPomo.value) || 25);
    AppState.timer.short = Math.max(1, parseInt(inputShort.value) || 5);
    AppState.timer.long = Math.max(1, parseInt(inputLong.value) || 15);
    AppState.automation.autoStartBreaks = autoBreakToggle.checked;
    AppState.automation.autoStartPomodoros = autoPomoToggle.checked;
    AppState.automation.tickingAudioPulse = tickingToggle.checked;
    saveConfiguration();
    switchMode(AppState.timer.currentMode, true);
    closeSettings();
});

const statsPanel = document.getElementById('stats-panel');
const statsOpenBtn = document.getElementById('stats-toggle-btn');
const statsCloseBtn = document.getElementById('stats-close-btn');
const statsClearBtn = document.getElementById('stats-clear-btn');

statsOpenBtn.addEventListener('click', () => {
    populateHistoryList();
    statsPanel.classList.remove('translate-x-full');
});

statsCloseBtn.addEventListener('click', () => {
    statsPanel.classList.add('translate-x-full');
});

statsClearBtn.addEventListener('click', () => {
    AppState.history = [];
    AppState.stats.dailyCompleted = 0;
    AppState.stats.totalMinutes = 0;
    saveStats();
    updateAnalyticsUI();
    populateHistoryList();
});

function logSessionToHistory(title, duration, type) {
    const entry = {
        title,
        duration,
        type,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })
    };
    AppState.history.unshift(entry);
    saveHistory();
}

function populateHistoryList() {
    const listContainer = document.getElementById('session-log-list');
    listContainer.innerHTML = '';
    if (AppState.history.length === 0) {
        listContainer.innerHTML = `<div class="text-center py-8 text-xs text-cream-300 dark:text-zinc-500 italic">No past sessions logged. Deep focus starts now.</div>`;
        return;
    }
    AppState.history.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'flex items-center justify-between p-3 bg-cream-50 dark:bg-zinc-900/40 border border-cream-100 dark:border-zinc-800 rounded-2xl';
        let iconName = 'target';
        let iconColor = 'text-focus';
        if (item.type === 'short') { iconName = 'coffee'; iconColor = 'text-short'; }
        if (item.type === 'long') { iconName = 'shield-alert'; iconColor = 'text-long'; }
        itemEl.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl bg-cream-100 dark:bg-zinc-800 flex items-center justify-center">
                    <i data-lucide="${iconName}" class="w-4 h-4 ${iconColor}"></i>
                </div>
                <div>
                    <span class="text-xs font-semibold block text-cream-900 dark:text-zinc-100">${item.title}</span>
                    <span class="text-[10px] text-cream-300 dark:text-zinc-500 font-mono">${item.date} at ${item.timestamp}</span>
                </div>
            </div>
            <span class="text-xs font-bold font-mono text-cream-800 dark:text-zinc-300">${item.duration}m</span>
        `;
        listContainer.appendChild(itemEl);
    });
    lucide.createIcons();
}

function updateAnalyticsUI() {
    const ratioText = document.getElementById('daily-target-ratio');
    const targetPercent = Math.min(100, (AppState.stats.dailyCompleted / 4) * 100);
    ratioText.innerText = `${AppState.stats.dailyCompleted}/4 sessions`;
    document.getElementById('daily-progress-bar').style.width = `${targetPercent}%`;
    document.getElementById('stat-total-focus').innerText = `${AppState.stats.totalMinutes}m`;
    document.getElementById('stat-streak').innerText = `${AppState.stats.streak} ${AppState.stats.streak === 1 ? 'day' : 'days'}`;
    document.getElementById('log-total-sessions').innerText = AppState.history.filter(h => h.type === 'pomodoro').length;
    document.getElementById('log-total-minutes').innerText = `${AppState.stats.totalMinutes}m`;
}

function saveTasks() { localStorage.setItem('zenith_tasks', JSON.stringify(AppState.tasks)); }
function saveStats() { localStorage.setItem('zenith_stats_v1', JSON.stringify(AppState.stats)); }
function saveHistory() { localStorage.setItem('zenith_history_v1', JSON.stringify(AppState.history)); }

function saveConfiguration() {
    const config = {
        times: {
            pomo: AppState.timer.pomodoro,
            short: AppState.timer.short,
            long: AppState.timer.long
        },
        auto: AppState.automation
    };
    localStorage.setItem('zenith_config', JSON.stringify(config));
}

function loadSavedState() {
    if (localStorage.getItem('zenith_dark_mode') !== null) {
        AppState.ui.isDark = localStorage.getItem('zenith_dark_mode') === 'true';
    } else {
        AppState.ui.isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    updateTheme();
    const savedConfig = localStorage.getItem('zenith_config');
    if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        AppState.timer.pomodoro = parsed.times.pomo || 25;
        AppState.timer.short = parsed.times.short || 5;
        AppState.timer.long = parsed.times.long || 15;
        AppState.automation = parsed.auto || AppState.automation;
    }
    const savedTasks = localStorage.getItem('zenith_tasks');
    if (savedTasks) { AppState.tasks = JSON.parse(savedTasks); }
    const savedStats = localStorage.getItem('zenith_stats_v1');
    if (savedStats) { AppState.stats = JSON.parse(savedStats); }
    const savedHistory = localStorage.getItem('zenith_history_v1');
    if (savedHistory) { AppState.history = JSON.parse(savedHistory); }
    switchMode('pomodoro', true);
    renderTasks();
    updateAnalyticsUI();
}

window.onload = function() {
    lucide.createIcons();
    loadSavedState();
    resizeCanvas();
    initParticles();
    animate();
    window.addEventListener('resize', () => {
        resizeCanvas();
        initParticles();
    });
};
