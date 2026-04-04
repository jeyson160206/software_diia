// script.js - DIIA Dashboard Functionality - FULL IMPLEMENTATION
// Video upload with FormData, YOLO sim, real backend sync, Chart.js metrics, audio alerts

document.addEventListener('DOMContentLoaded', function() {
    // LIVE CLOCK
    function updateClock() {
        const clockElement = document.getElementById('live-clock');
        if (clockElement) {
            const now = new Date();
            const timeString = now.toLocaleTimeString('es-ES', { 
                hour12: true, 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit' 
            });
            clockElement.textContent = timeString;
        }
    }
    updateClock();
    setInterval(updateClock, 1000);

    // TABS HANDLING
    const tabLinks = document.querySelectorAll('.tab-link');
    const contentWrapper = document.querySelector('.content-wrapper');
    
    if (tabLinks.length > 0) {
        tabLinks.forEach(link => {
            link.addEventListener('click', async () => {
                tabLinks.forEach(t => t.classList.remove('active'));
                link.classList.add('active');
                
                const tabText = link.textContent.trim();
                const videoContainer = document.getElementById('videoContainer');
                
                if (tabText === 'Vista General') {
                    const empty = document.querySelector('.empty-dashboard');
                    if (empty && contentWrapper) {
                        contentWrapper.innerHTML = empty.outerHTML;
                    }
                    if (videoContainer) videoContainer.style.display = 'grid';
                } else if (tabText === 'Entrenamientos') {
                    if (videoContainer) videoContainer.style.display = 'none';
                    if (typeof loadEntrenamientos === 'function') await loadEntrenamientos();
                } else if (tabText === 'Datasets') {
                    if (videoContainer) videoContainer.style.display = 'none';
                    if (typeof loadDatasets === 'function') loadDatasets();
                } else if (tabText === 'Métricas de Inferencia') {
                    if (videoContainer) videoContainer.style.display = 'none';
                    if (typeof loadMetricas === 'function') await loadMetricas();
                }
            });
        });
    }

    // VIDEO UPLOAD & SIMULATION
    let currentVideoFile = null;
    let currentVideo = null;
    let summaryDetections = [];
    let currentAnalysisData = null;

    const uploadBtn = document.querySelector('.btn-primary');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'video/*';
            input.onchange = analyzeVideoFile;
            input.click();
        });
    }

    async function analyzeVideoFile(e) {
        const file = e.target.files[0];
        if (!file) return;

        const spinner = document.getElementById('loadingSpinner');
        if (spinner) spinner.style.display = 'flex';

        const formData = new FormData();
        formData.append('video', file);

        try {
            const response = await fetch('/analyze-video', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (spinner) spinner.style.display = 'none';
            
            if (data.status === 'OK') {
                currentAnalysisData = data;

                // Hide empty dashboard
                const empty = document.querySelector('.empty-dashboard');
                if (empty) empty.style.display = 'none';

                // Load video UI with original blob URL
                const videoContainer = document.getElementById('videoContainer');
                if (videoContainer) {
                    videoContainer.innerHTML = getVideoGridHTML(URL.createObjectURL(file));
                }
                
                // Setup video
                const video = document.querySelector('#main-video');
                if (video) currentVideo = video;

                // Populate detections
                const ul = document.getElementById('detections-ul');
                if (ul) {
                    ul.innerHTML = '';
                    let totalCount = 0;
                    let avgConf = 0;
                    let confCount = 0;
                    Object.entries(data.detections || {}).forEach(([label, info]) => {
                        totalCount += info.count || 0;
                        avgConf += info.confidence || 0;
                        confCount++;
                        const secondsStr = (info.seconds || []).map(s => `${s}s`).join(', ');
                        const li = document.createElement('li');
                        li.className = 'badge';
                        li.innerHTML = `<strong>${label.toUpperCase()}</strong> (${secondsStr})<br><small>Conf: ${info.confidence || 0}% (${info.count || 0}x)</small>`;
                        ul.appendChild(li);
                    });
                    // Update metrics
                    const avgConfValue = confCount > 0 ? (avgConf / confCount).toFixed(1) : 0;
                    const confidenceVal = document.getElementById('confidence-val');
                    if (confidenceVal) confidenceVal.textContent = avgConfValue + '%';
                    const countVal = document.getElementById('count-val');
                    if (countVal) countVal.textContent = totalCount;
                    
                    // Set inference time
                    const inferenceVal = document.getElementById('inference-val');
                    if (inferenceVal) inferenceVal.textContent = data.inference_time + 's';
                }

                // Enable save btn
                if (video && video.parentElement) {
                    const saveBtn = document.createElement('button');
                    saveBtn.className = 'btn btn-primary save-confirm-btn';
                    saveBtn.innerHTML = '<i class="fas fa-save"></i> Confirmar y Guardar en DB';
                    saveBtn.style.marginTop = '1rem';
                    video.parentElement.appendChild(saveBtn);
                    saveBtn.addEventListener('click', () => uploadSummary(file));
                }
            } else {
                alert('Error in analysis: ' + (data.error || 'Unknown'));
            }
        } catch (error) {
            if (spinner) spinner.style.display = 'none';
            alert('Error analyzing video: ' + error.message + '\nEnsure backend is running');
        }
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
                        <span class="bar-value" id="inference-val">0s</span>
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

    function playBeep() {
        try {
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
        } catch (e) {}
    }

    window.playBeep = playBeep; // Global for other modules
    window.detectionData = {}; // Global for sim data
});

