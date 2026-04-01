// script.js - DIIA Dashboard Functionality
// Handles tabs, video upload sim, live clock, metrics sync with YOLO mock data

document.addEventListener('DOMContentLoaded', function() {
    // === LIVE CLOCK ===
    function updateClock() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('es-ES', { 
            hour12: true, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        document.getElementById('live-clock').textContent = timeString;
    }
    updateClock();
    setInterval(updateClock, 1000);

    // === TABS HANDLING ===
    const tabLinks = document.querySelectorAll('.tab-link');
    const contentWrapper = document.querySelector('.content-wrapper');
    
    tabLinks.forEach(link => {
        link.addEventListener('click', async () => {
            tabLinks.forEach(t => t.classList.remove('active'));
            link.classList.add('active');
            
            const tabText = link.textContent.trim();
            const videoContainer = document.getElementById('videoContainer');
            
            if (tabText === 'Vista General') {
                if (document.querySelector('.empty-dashboard')) {
                    contentWrapper.innerHTML = document.querySelector('.empty-dashboard').outerHTML;
                    attachUploadListener();
                }
                videoContainer.style.display = 'grid';
            } else if (tabText === 'Entrenamientos') {
                videoContainer.style.display = 'none';
                contentWrapper.innerHTML = '<div id="history-container"><p>Cargando historial...</p></div>';
                await loadHistory();
            } else if (tabText === 'Métricas de Inferencia') {
                videoContainer.style.display = 'none';
                contentWrapper.innerHTML = '<div id="metrics-container"><p>Cargando métricas...</p></div>';
                await loadMetrics();
            } else {
                videoContainer.style.display = 'none';
                contentWrapper.innerHTML = `
                    <div class="tab-content">
                        <h3>${tabText}</h3>
                        <p>Próximamente</p>
                    </div>
                `;
            }
        });
    });

    function attachUploadListener() {
        const uploadBtn = contentWrapper.querySelector('.btn-primary');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', handleUpload);
        }
    }

    // === VIDEO UPLOAD & SIMULATION ===
    const uploadBtn = document.querySelector('.btn-primary');
    const emptyDashboard = document.querySelector('.empty-dashboard');
    const videoContainer = document.getElementById('videoContainer');
    let currentVideo = null;

    uploadBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                loadVideo(file);
            }
        };
        input.click();
    });

    function loadVideo(file) {
        const videoURL = URL.createObjectURL(file);
        emptyDashboard.style.display = 'none';
        videoContainer.innerHTML = getVideoGridHTML(videoURL);
        currentVideo = document.querySelector('#main-video');
        initVideoSync(currentVideo);
    }

    function getVideoGridHTML(videoSrc) {
        return `
            <div class="video-section">
                <video id="main-video" src="${videoSrc}" controls preload="metadata"></video>
            </div>
            <div class="metrics-panel">
                <h4><i class="fas fa-chart-line"></i> Métricas en Vivo</h4>
                <div class="metric-bars">
                    <div class="bar-container">
                        <label>Confianza Promedio</label>
                        <div class="bar">
                            <div class="bar-fill" id="confidence-bar" style="width: 0%"></div>
                        </div>
                        <span class="bar-value" id="confidence-val">0%</span>
                    </div>
                    <div class="bar-container">
                        <label>Cantidad Detectada</label>
                        <div class="bar">
                            <div class="bar-fill" id="count-bar" style="width: 0%"></div>
                        </div>
                        <span class="bar-value" id="count-val">0</span>
                    </div>
                </div>
                <div class="distribution-section">
                    <h5><i class="fas fa-chart-pie"></i> Distribución Total</h5>
                    ${Object.keys(detectionData).map(obj => `
                        <div class="bar-container">
                            <label>${obj.toUpperCase()}</label>
                            <div class="bar distrib-bar-${obj}">
                                <div class="bar-fill" id="distrib-${obj}" style="width: 0%"></div>
                            </div>
                            <span class="bar-value" id="distrib-val-${obj}">0%</span>
                        </div>
                    `).join('')}
                </div>
                <div class="detections-list">
                    <h5><i class="fas fa-tags"></i> Objetos Detectados</h5>
                    <ul id="detections-ul"></ul>
                </div>
                <div class="incidents-panel" id="incidents-panel"></div>
            </div>
        `;
    }

// === ENHANCED YOLO DETECTION DATA w/ RANGES ===
    const detectionData = {
        "fuego": [[1,4], [23,25]],
        "choque": [[10,13]],
        "humo": [[1,2], [5,7]]
    };

let totalDuration = 0;
    let distributionBars = null;
    let statusText = document.querySelector('.status-text');
    let detectedObjects = new Map(); // obj -> {ranges: [], startTimes: [], confs: [], endTimes: []}
    let currentActive = new Set();
    let summaryDetections = []; // for POST

function initVideoSync(video) {
        video.addEventListener('loadedmetadata', () => {
            totalDuration = video.duration;
            computeDistribution();
            detectedObjects.clear();
            currentActive.clear();
            summaryDetections = [];
        });
        video.addEventListener('timeupdate', () => {
            const time = Math.floor(video.currentTime);
            updateMetrics(time);
        });
        video.addEventListener('ended', () => {
            // Show manual save button
            const saveBtn = document.createElement('button');
            saveBtn.id = 'save-btn';
            saveBtn.className = 'btn btn-primary save-confirm-btn';
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Confirmar y Guardar en DB';
            saveBtn.style.marginTop = '1rem';
            const videoSection = video.parentElement;
            videoSection.appendChild(saveBtn);
            
            saveBtn.addEventListener('click', async () => {
                await uploadSummary(video.files[0]?.name || 'unknown.mp4');
                saveBtn.remove();
            });
        });
    }

async function uploadSummary(videoName) {
        if (summaryDetections.length === 0) return;
        try {
            const response = await fetch('http://127.0.0.1:8000/upload-results', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    name: videoName,
                    detections: summaryDetections
                })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            console.log('DB Upload success:', result);
            
            // Visual notification
            const notification = document.createElement('div');
            notification.className = 'success-notification';
            notification.innerHTML = `✅ Datos sincronizados en PostgreSQL! <br>Video ID: ${result.video_id} (${result.detections_added} det.)`;
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 5000);
        } catch (e) {
            console.error('Upload failed:', e);
            alert(`Error: ${e.message}\nStart backend: cd backend && uvicorn main:app --reload`);
        }
    }

    function isActive(obj, time) {
        return detectionData[obj].some(range => time >= range[0] && time <= range[1]);
    }

    function getTimeline(obj) {
        return detectionData[obj].map(r => `${r[0]}s-${r[1]}s`).join(', ');
    }

    function computeDistribution() {
        const counts = {};
        Object.keys(detectionData).forEach(obj => {
            counts[obj] = detectionData[obj].reduce((sum, r) => sum + (r[1] - r[0] + 1), 0);
        });
        const maxCount = Math.max(...Object.values(counts));
        distributionBars = counts;
        // Update distrib bars (add to HTML dynamically later)
    }

function updateMetrics(time) {
        const activeObjects = Object.keys(detectionData).filter(obj => isActive(obj, time));
        
        // Track changes for persistence
        activeObjects.forEach(obj => {
            if (!currentActive.has(obj)) {
                // New detection start
                if (!detectedObjects.has(obj)) {
                    detectedObjects.set(obj, {ranges: [], startTimes: [], confs: [], endTimes: []});
                }
                const entry = detectedObjects.get(obj);
                entry.startTimes.push(time);
                entry.confs.push(85 + Math.random()*10); // avg conf per detection
            }
        });
        

        // Close ended detections
        for (let obj of currentActive) {
            if (!activeObjects.includes(obj)) {
                // Ended
                const entry = detectedObjects.get(obj);
                const start = entry.startTimes[entry.startTimes.length -1];
                const dur = time - start;
                if (dur >= 0.5) { // Filter noise <0.5s
                    const conf = entry.confs[entry.confs.length -1];
                    entry.endTimes.push(time);
                    const sev = dur > 5 ? 'High' : dur > 2 ? 'Medium' : 'Low';
                    summaryDetections.push({label: obj, start_time: start, end_time: time, confidence: conf, severity: sev});
                } else {
                    // Ignore short
                    entry.startTimes.pop();
                    entry.confs.pop();
                }
            }
        }
        currentActive = new Set(activeObjects);

        
        const count = activeObjects.length;
        const conf = 70 + Math.random() * 25 + (count * 5);

        // Update main bars
        document.getElementById('confidence-bar').style.width = conf + '%';
        document.getElementById('confidence-val').textContent = Math.round(conf) + '%';
        document.getElementById('count-bar').style.width = Math.min(count * 25, 100) + '%';
        document.getElementById('count-val').textContent = count;

        // Update detections list: all detected, live green/past gray
        const ul = document.getElementById('detections-ul');

        const allDetected = Array.from(detectedObjects.keys());
        ul.innerHTML = allDetected.map(obj => {
            const isLive = activeObjects.includes(obj);
            const entry = detectedObjects.get(obj);
            const isDanger = ['fuego', 'choque'].includes(obj);
            const classes = ['badge'];
            if (isLive) classes.push('live');
            else classes.push('detected-past');
            if (isDanger) classes.push('danger');
            const timeline = getTimeline(obj);
            const lastRange = entry.endTimes.length > 0 ? `${entry.startTimes.slice(-1)}s-${entry.endTimes.slice(-1)}s` : 'Ongoing';
            const uniqueCount = new Set(entry.ranges.map(r => r.id || r)).size || 1; // Mock unique tracker
            return `<li><span class="${classes.join(' ')}">${obj.toUpperCase()}${isLive ? ' LIVE' : ''} (Únicos: ${uniqueCount})</span><br><small>${timeline} | Severidad: ${isLive ? 'Active' : 'Past'}</small></li>`;
        }).join('');


        // Danger state
        const metricsPanel = document.querySelector('.metrics-panel');
        const hasDanger = activeObjects.some(obj => ['fuego', 'choque'].includes(obj));
        if (hasDanger) {
            metricsPanel.classList.add('danger');
            statusText.textContent = '¡PELIGRO CRÍTICO!';
            showIncident(`${activeObjects.find(obj => ['fuego', 'choque'].includes(obj)).toUpperCase()} LIVE`);
        } else {
            metricsPanel.classList.remove('danger');
            statusText.textContent = 'NODO ACTIVO';
            document.getElementById('incidents-panel').innerHTML = '';
        }

        // Update distribution
        if (distributionBars && time % 5 === 0) updateDistribBars();
    }

    function updateDistribBars() {
        Object.keys(distributionBars).forEach(obj => {
            const bar = document.getElementById(`distrib-${obj}`);
            if (bar) {
                const pct = (distributionBars[obj] / totalDuration * 100);
                bar.style.width = pct + '%';
            }
        });
    }

    function showIncident(message) {
        const panel = document.getElementById('incidents-panel');
        panel.innerHTML = `
            <div class="incident blink">
                <i class="fas fa-exclamation-triangle"></i>
                <span>${message}</span>
            </div>
        `;
    }

    // Helper for empty HTML if needed
    function getEmptyHTML() {
        return document.querySelector('.empty-dashboard').outerHTML;
    }
});
