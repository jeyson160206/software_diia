// Frontend/datasets.js - Load Datasets Tab Content
// Static cards for CVAT stats + load new dataset button

function loadDatasets() {
    if (typeof window.showSection === 'function') window.showSection('datasets');
    const contentWrapper = document.querySelector('.content-wrapper');
    contentWrapper.innerHTML = `
        <div class="tab-content datasets-grid">
    <h3 style="text-align: center; margin-bottom: 2rem; color: var(--turquesa);">
                <i class="fas fa-database"></i> Datasets &amp; Inventario de Etiquetado
            </h3>
            <div class="stats-cards">
                <div class="stat-card">
                    <h4><i class="fas fa-mountain"></i> Piedras Grandes</h4>
                    <div class="stat-number">2,847</div>
                    <p style="color: var(--text-mid); margin-top: 0.5rem;">Imágenes validadas</p>
                </div>
                <div class="stat-card">
                    <h4><i class="fas fa-exclamation-triangle"></i> Incidentes de Seguridad</h4>
                    <div class="stat-number">156</div>
                    <p style="color: var(--text-mid); margin-top: 0.5rem;">Casos críticos</p>
                </div>
                <div class="stat-card">
                    <h4><i class="fas fa-images"></i> Frames Etiquetados</h4>
                    <div class="stat-number">12,504</div>
                    <p style="color: var(--text-mid); margin-top: 0.5rem;">Total procesado en CVAT</p>
                </div>
            </div>
            <div style="text-align: center; margin-top: 3rem;">
                <button class="btn btn-primary" onclick="alert('Simulado: Redirigiendo a CVAT para cargar nuevo dataset')">
                    <i class="fas fa-cloud-upload-alt"></i> Cargar Nuevo Dataset
                </button>
                <p style="color: var(--text-mid); margin-top: 1rem;">
                    Compatible con CVAT AI - Formato YOLOv8
                </p>
            </div>
        </div>
    `;
}
