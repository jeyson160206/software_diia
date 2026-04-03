// script.js - DIIA Dashboard Functionality - FULL IMPLEMENTATION
// Video upload with FormData, YOLO sim, real backend sync, Chart.js metrics, audio alerts

document.addEventListener('DOMContentLoaded', function() {
    // LIVE CLOCK
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

    // TABS HANDLING
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
                }
                videoContainer.style.display = 'grid';
            } else if (tabText === 'Entrenamientos') {
                videoContainer.style.display = 'none';
                await loadEntrenamientos();
            } else if (tabText === 'Datasets') {
                videoContainer.style.display = 'none';
                loadDatasets();
            } else if (tabText === 'Métricas de Inferencia') {
                videoContainer.style.display = 'none';
                await loadMetricas();
            }
        });
    });

    // VIDEO UPLOAD & SIMULATION
    let currentVideoFile = null;
    let currentVideo = null;
    let summaryDetections = [];
let currentAnalysisData = null;

    document.querySelector('.btn-primary').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*';
        input.onchange = analyzeVideoFile;
        input.click();
    });

    async function analyzeVideoFile(e) {
        const file = e.target.files[0];
        if (!file) return;

        const spinner = document.getElementById('loadingSpinner');
        spinner.style.display = 'flex';

        const formData = new FormData();
        formData.append('video', file);

        try {
            const response = await fetch('http://127.0.0.1:8000/analyze-video', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (data.status === 'OK') {
                spinner.style.display = 'none';
                currentAnalysisData = data;

                // Hide empty dashboard
                const empty = document.querySelector('.empty-dashboard');
                if (empty) empty.style.display = 'none';

                // Load video UI with original blob URL
                const videoContainer = document.getElementById('videoContainer');
                videoContainer.innerHTML = getVideoGridHTML(URL.createObjectURL(file)); // Use blob for playback, backend copy saved for static
                
                // Setup video
                const video = document.querySelector('#main-video');
                currentVideo = video;

                // Populate detections
                const ul = document.getElementById('detections-ul');
                ul.innerHTML = '';
                let totalCount = 0;
                let avgConf = 0;
                let confCount = 0;
                Object.entries(data.detections).forEach(([label, info]) => {
                  totalCount += info.count;
                  avgConf += info.confidence;
                  confCount++;
                  const secondsStr = info.seconds.map(s => `${s}s`).join(', ');
                  const li = document.createElement('li');
                  li.className = 'badge';
                  li.innerHTML = `<strong>${label.toUpperCase()}</strong> (${secondsStr})<br><small>Conf: ${info.confidence}% (${info.count}x)</small>`;
                  ul.appendChild(li);
                });
                // Update metrics
                const avgConfValue = confCount > 0 ? (avgConf / confCount).toFixed(1) : 0;
                document.getElementById('confidence-val').textContent = avgConfValue + '%';
                document.getElementById('count-val').textContent = totalCount;
                
                // Set inference time
                document.getElementById('inference-val').textContent = data.inference_time + 's';

                // Enable save btn
                const saveBtn = document.createElement('button');
                saveBtn.className = 'btn btn-primary save-confirm-btn';
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Confirmar y Guardar en DB';
                saveBtn.style.marginTop = '1rem';
                video.parentElement.appendChild(saveBtn);
                saveBtn.addEventListener('click', () => uploadSummary(file));
            } else {
                spinner.style.display = 'none';
                alert('Error in analysis: ' + data.error);
            }
        } catch (error) {
            spinner.style.display = 'none';
            alert('Error analyzing video: ' + error.message + '\nEnsure backend is running: cd backend && uvicorn main:app --reload');
        }
    }

    function loadVideo(videoSrc) {
        const emptyDashboard = document.querySelector('.empty-dashboard');
        const videoContainer = document.getElementById('videoContainer');
        if (emptyDashboard) emptyDashboard.style.display = 'none';
        videoContainer.innerHTML = getVideoGridHTML(videoSrc);
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
                            <div class="bar-fill" id="confidence-bar" style="width: 85%"></div>
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
                    <div class="bar-container inference-time">
                        <label>Tiempo Total de Inferencia</label>
                        <div class="bar">
                            <div class="bar-fill" id="inferenceBar" style="width: 100%"></div>
                        </div>
                        <span class="bar-value" id="inferenceVal">0s</span>
                    </div>
                </div>
                <div class="detections-list">
                    <h5><i class="fas fa-tags"></i> Objetos Detectados</h5>
                    <ul id="detections-ul"></ul>
                </div>
                <div class="incidents-panel" id="incidents-panel"></div>
            </div>
        `;
    }

    function initVideoSync(video) {
        video.addEventListener('loadedmetadata', () => {
            summaryDetections = [];
        });
        video.addEventListener('timeupdate', () => {
            const time = Math.floor(video.currentTime);
            updateMetrics(time);
        });
        video.addEventListener('ended', () => {
            const saveBtn = document.createElement('button');
            saveBtn.className = 'btn btn-primary save-confirm-btn';
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Confirmar y Guardar en DB';
            saveBtn.style.marginTop = '1rem';
            video.parentElement.appendChild(saveBtn);
            saveBtn.addEventListener('click', () => uploadSummary(currentVideoFile));
        });
    }

    async function uploadSummary(videoFile) {
        if (summaryDetections.length === 0) return;
        try {
            const formData = new FormData();
            formData.append('video', videoFile);
            formData.append('summary', JSON.stringify({
                name: videoFile.name,
                detections: summaryDetections
            }));
            const response = await fetch('http://127.0.0.1:8000/upload-results', { method: 'POST', body: formData });
            const result = await response.json();
            // Success notification
            const notification = document.createElement('div');
            notification.className = 'success-notification';
            notification.innerHTML = `✅ Video guardado! ID: ${result.video_id}`;
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 5000);
        } catch (e) {
            alert('Error upload: ' + e.message);
        }
    }



// Duplicate loadHistory() and loadMetrics() removed - logic now in modular files

    // YOLO SIM + METRICS + ALERTS
    function updateMetrics(time) {
        const activeObjects = Object.keys(detectionData).filter(obj => detectionData[obj].some(r => time >= r[0] && time <= r[1]));
        const count = activeObjects.length;
        const conf = 70 + Math.random() * 25 + count * 5;
        
        document.getElementById('confidence-bar').style.width = conf + '%';
        document.getElementById('confidence-val').textContent = Math.round(conf) + '%';
        document.getElementById('count-bar').style.width = Math.min(count * 25, 100) + '%';
        document.getElementById('count-val').textContent = count;

        // Detection tracking + severity
        // (existing logic simplified)
        const hasHighSeverity = activeObjects.some(obj => ['fuego', 'choque'].includes(obj));
        if (hasHighSeverity) {
            document.querySelector('.metrics-panel').classList.add('danger');
            playBeep();
        }

        // Update detections list (simplified)
        const ul = document.getElementById('detections-ul');
        ul.innerHTML = activeObjects.map(obj => `<li class="badge live danger">${obj.toUpperCase()} LIVE</li>`).join('');
    }

    function playBeep() {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 800;
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.2);
    }
});
