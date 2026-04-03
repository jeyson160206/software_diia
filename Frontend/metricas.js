// Frontend/metricas.js - Load Métricas de Inferencia Tab
// Charts with Chart.js, empty state overlay

async function loadMetricas() {
    const contentWrapper = document.querySelector('.content-wrapper');
    contentWrapper.innerHTML = `
        <div class="tab-content metrics-dashboard">
            <h3 style="margin-bottom: 2rem; color: var(--neon-green); text-align: center;">
                <i class="fas fa-chart-line"></i> Métricas de Inferencia &amp; Analítica
            </h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; position: relative;">
                <div style="position: relative;">
                    <canvas id="incidentsChart" style="max-height: 300px; width: 100%;"></canvas>
                </div>
                <div style="position: relative;">
                    <canvas id="confidenceChart" style="max-height: 300px; width: 100%;"></canvas>
                </div>
            </div>
            <div style="margin-top: 2rem; text-align: center;">
                <a href="http://127.0.0.1:8000/export-csv" class="btn btn-primary" target="_blank">
                    <i class="fas fa-download"></i> Descargar Reporte CSV Completo
                </a>
            </div>
        </div>
    `;

    try {
        const response = await fetch('http://127.0.0.1:8000/videos');
        const data = await response.json();
        const videos = data.videos || [];

        // Check if empty
        if (videos.length === 0) {
            const chartsContainer = contentWrapper.querySelector('div[style*="grid"]');
            chartsContainer.innerHTML += `
                <div class="no-data-overlay" style="
                    position: absolute; top: 0; left: 0; right: 0; bottom: 0; 
                    background: rgba(5,10,14,0.95); display: flex; flex-direction: column; 
                    align-items: center; justify-content: center; border-radius: 12px;
                    backdrop-filter: blur(10px);
                ">
                    <i class="fas fa-chart-bar" style="font-size: 4rem; color: #64748b; margin-bottom: 1rem;"></i>
                    <h3 style="color: var(--text-high); margin-bottom: 0.5rem;">Esperando datos</h3>
                    <p style="color: var(--text-mid); font-size: 1.1rem;">
                        de entrenamiento para generar estadísticas
                    </p>
                    <p style="color: var(--text-mid); margin-top: 1rem; font-size: 0.9rem;">
                        Guarda tu primer video para ver las métricas en acción
                    </p>
                </div>
            `;
            return;
        }

        // Render charts with data
        const incidentsCtx = document.getElementById('incidentsChart')?.getContext('2d');
        if (incidentsCtx) {
            const fuegoCount = videos.filter(v => v.total_detections > 5).length;
            const otherCount = videos.length - fuegoCount;
            new Chart(incidentsCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Incidentes Críticos', 'Detecciones Normales'],
                    datasets: [{
                        data: [fuegoCount, otherCount],
                        backgroundColor: ['#ff4757', '#10b981']
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        const confidenceCtx = document.getElementById('confidenceChart')?.getContext('2d');
        if (confidenceCtx) {
            const recentVideos = videos.slice(0, 8);
            const labels = recentVideos.map(v => v.name.slice(0, 12) + '...');
            const confData = recentVideos.map(v => (v.avg_confidence || 0) * 100);
            new Chart(confidenceCtx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Confianza Promedio (%)',
                        data: confData,
                        borderColor: '#00ff9d',
                        backgroundColor: 'rgba(0, 255, 157, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true, max: 100 } }
                }
            });
        }
    } catch (error) {
        console.error('Error loading métricas:', error);
        // Keep empty overlay or show error
    }
}
