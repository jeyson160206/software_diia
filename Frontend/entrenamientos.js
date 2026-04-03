// Frontend/entrenamientos.js - Load Entrenamientos Tab Content
// Fetches /videos, renders table or empty state

async function loadEntrenamientos() {
    const contentWrapper = document.querySelector('.content-wrapper');
    contentWrapper.innerHTML = '<div id="entrenamientos-container" style="padding: 2rem; text-align: center;"><p>Cargando historial...</p></div>';

    try {
        const response = await fetch('http://127.0.0.1:8000/videos');
        const data = await response.json();
        const videos = data.videos || [];

        const container = document.getElementById('entrenamientos-container');

        if (videos.length === 0) {
            container.innerHTML = `
                <div class="no-data-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px;">
                    <div class="warning-icon" style="font-size: 4rem; color: #ff6b35; margin-bottom: 1rem;">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h3 style="color: var(--text-high); margin-bottom: 0.5rem;">No hay data registrada</h3>
                    <p style="color: var(--text-mid); font-size: 1.1rem; margin-bottom: 2rem;">
                        No se han guardado videos aún
                    </p>
                    <p style="color: var(--text-mid);">
                        Sube tu primer video procesado con YOLO para comenzar el historial.
                    </p>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="history-table">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Video</th>
                                <th>Fecha Creación</th>
                                <th>Detecciones Totales</th>
                                <th>Confianza Promedio</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${videos.map(video => `
                                <tr>
                                    <td>${video.id}</td>
                                    <td>${video.name}</td>
                                    <td>${new Date(video.created_at).toLocaleDateString('es-ES')}</td>
                                    <td>${video.total_detections}</td>
                                    <td>${(video.avg_confidence * 100).toFixed(1)}%</td>
                                    <td><button class="btn btn-outline">Ver Detalle</button></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading entrenamientos:', error);
        document.getElementById('entrenamientos-container').innerHTML = 
            '<p style="color: var(--alert-red);">Error cargando historial. Verifica que el backend esté activo.</p>';
    }
}
