from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os
from typing import List
import psycopg2
from psycopg2.extras import RealDictCursor
import time
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware
import cv2
import torch
from collections import defaultdict
import pandas as pd
import io
import shutil

# 1. Configuración de Rutas Absolutas
BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "Frontend"
INDEX_PATH = FRONTEND_DIR / "index.html"
UPLOAD_DIR_PATH = BASE_DIR / "uploads"
UPLOAD_DIR_PATH.mkdir(exist_ok=True)

from transformers import OwlViTProcessor, OwlViTForObjectDetection

app = FastAPI(title="DIIA Backend")

# Global OWL-ViT
owl_processor = None
owl_model = None
device = "cpu"

def load_owl_vit():
    global owl_processor, owl_model
    if owl_model is None:
        # Usamos OwlViT (v1) para total compatibilidad con el patch32
        model_id = "google/owlvit-base-patch32"
        print(f"Cargando cerebro de IA ({model_id})...")
        owl_processor = OwlViTProcessor.from_pretrained(model_id)
        owl_model = OwlViTForObjectDetection.from_pretrained(model_id)
        owl_model.to(device)
        print("IA Lista para detectar.")
    return owl_processor, owl_model

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR_PATH)), name="uploads")
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

# DB config
DB_CONFIG = {
    "host": "localhost",
    "database": "software",
    "user": "postgres",
    "password": "71602598",
    "cursor_factory": RealDictCursor
}

class Detection(BaseModel):
    label: str
    start_time: int
    end_time: int
    confidence: float
    severity: str = "Low"

class VideoSummary(BaseModel):
    name: str
    detections: List[Detection]

@app.get("/")
async def read_index():
    if not INDEX_PATH.exists():
        return {"error": f"No se encuentra index.html en: {INDEX_PATH}"}
    return FileResponse(str(INDEX_PATH))

@app.post("/analyze-video")
async def analyze_video(
    video: UploadFile = File(...),
    prompts: List[str] = Query(["fire", "smoke", "person", "helmet", "excavator", "safety vest"]),
    min_confidence: float = Query(0.2)
):
    filename = video.filename
    start_time = time.time()
    
    # Save video first for OpenCV using UPLOAD_DIR
    UPLOAD_DIR = str(UPLOAD_DIR_PATH)
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    video_path = os.path.join(UPLOAD_DIR, filename)
    content = await video.read()
    with open(video_path, "wb") as f:
        f.write(content)
    
    # Open video with path for OpenCV
    cap = cv2.VideoCapture(video_path)
    
    # Video info
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = frame_count / fps if fps > 0 else 0
    
    # Detections storage
    detections = defaultdict(list)
    max_confs = {}
    
    # Analyze every 3 seconds (speed opt)
    for sec in range(0, int(duration) + 1, 3):
        cap.set(cv2.CAP_PROP_POS_MSEC, sec * 1000)
        ret, frame = cap.read()
        if not ret:
            break
        
        try:
            owl_processor, owl_model = load_owl_vit()
            # Resize frame for OWL-ViT (max 400px speed opt)
            h, w = frame.shape[:2]
            scale = 400 / max(h, w)
            new_h, new_w = int(h * scale), int(w * scale)
            frame_resized = cv2.resize(frame, (new_w, new_h))
            
            # OWL-ViT inference
            inputs = owl_processor(text=[prompts], images=frame_resized, return_tensors="pt").to(device)
            with torch.no_grad():
                outputs = owl_model(**inputs)
            
            target_sizes = torch.tensor([frame_resized.shape[:2]]).to(device)
            
            # Función estándar OWL-ViT (post_process_queries)
            results = owl_processor.post_process_queries(outputs, target_sizes=target_sizes, threshold=min_confidence)
            results = results[0].cpu()
            
            # RAM cleanup
            del inputs, outputs
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception as e:
            print(f"Error en el análisis: {str(e)}")
            return JSONResponse(status_code=500, content={"error": str(e)})
        
        if len(results) > 0:
            boxes = results['boxes']
            scores = results['scores']
            labels_idx = results['labels'].long()
            for i in range(len(scores)):
                label_idx = labels_idx[i].item()
                label = prompts[label_idx]
                conf = scores[i].item()
                if conf > min_confidence:
                    detections[label].append(sec)
                    if label not in max_confs or conf > max_confs[label]:
                        max_confs[label] = conf
    
    cap.release()
    
    end_time = time.time()
    inference_time = round(end_time - start_time, 2)
    
    # Scale confidence to 0-100
    confs_100 = {label: round(max_conf * 100, 1) for label, max_conf in max_confs.items()}
    
    # Severity mapping
    severity_map = {
        "fire": "High", "explosion": "High",
        "person": "Low", "vehicle": "Low", "excavator": "Low"
    }
    
    # Prepare response
    result_detections = {}
    for label, seconds in detections.items():
        unique_seconds = sorted(list(set(seconds)))
        severity = severity_map.get(label.lower(), "Low")
        result_detections[label] = {
            "seconds": unique_seconds,
            "confidence": confs_100.get(label, 0),
            "count": len(unique_seconds),
            "severity": severity
        }
    
    return {
        "status": "OK",
        "filename": filename,
        "upload_url": f"/uploads/{filename}",
        "video_path": video_path,
        "duration": duration,
        "inference_time": inference_time,
        "detections": result_detections
    }

@app.post("/upload-results")
async def upload_results(summary: VideoSummary, video: UploadFile = File(...)):
    # Save video using UPLOAD_DIR_PATH
    video_path = os.path.join(str(UPLOAD_DIR_PATH), video.filename)
    with open(video_path, "wb") as buffer:
        shutil.copyfileobj(video.file, buffer)
    
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        
        # Insert video
        cur.execute("INSERT INTO videos (name) VALUES (%s) RETURNING id", (video.filename,))
        video_id = cur.fetchone()['id']
        
        # Insert detections w/severity
        for det in summary.detections:
            cur.execute(
                "INSERT INTO detections (video_id, label, start_time, end_time, confidence, severity) VALUES (%s, %s, %s, %s, %s, %s)",
                (video_id, det.label, det.start_time, det.end_time, det.confidence, det.severity)
            )
        
        # Compute analytics
        cur.execute("""
            INSERT INTO analytics (video_id, downtime_seconds, atasco_frequency, unique_objects, avg_confidence)
            SELECT %s,
                   SUM(CASE WHEN label LIKE '%%atasco%%' OR label = 'fuego' OR label = 'choque' THEN (end_time - start_time) ELSE 0 END),
                   COUNT(CASE WHEN label LIKE '%%atasco%%' OR label = 'fuego' OR label = 'choque' THEN 1 END),
                   COUNT(DISTINCT label),
                   AVG(confidence)
            FROM detections WHERE video_id = %s
        """, (video_id, video_id))
        
        conn.commit()
        return {"status": "success", "video_id": video_id, "video_saved": video_path, "detections_added": len(summary.detections)}

    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    
    finally:
        if conn:
            conn.close()

@app.get("/videos")
async def get_videos():
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT 
                v.id,
                v.name,
                v.created_at,
                COALESCE(COUNT(d.id), 0) as total_detections,
                COALESCE(AVG(d.confidence), 0) as avg_confidence
            FROM videos v 
            LEFT JOIN detections d ON v.id = d.video_id 
            GROUP BY v.id, v.name, v.created_at 
            ORDER BY v.created_at DESC
        """)
        videos = cur.fetchall()
        return {"videos": [dict(video) for video in videos]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@app.get("/export-csv")
async def export_all_csv():
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        df_videos = pd.read_sql("SELECT * FROM videos ORDER BY created_at DESC", conn)
        df_detections = pd.read_sql("SELECT * FROM detections d JOIN videos v ON d.video_id = v.id ORDER BY d.start_time", conn)
        df_analytics = pd.read_sql("SELECT * FROM analytics a JOIN videos v ON a.video_id = v.id ORDER BY a.created_at", conn)
        
        # Combined report
        combined_df = df_detections.merge(df_videos[['id', 'name']], left_on='video_id', right_on='id', suffixes=('', '_video'))
        combined_df = combined_df.merge(df_analytics[['video_id', 'downtime_seconds', 'atasco_frequency', 'unique_objects', 'avg_confidence']], on='video_id', how='left')
        
        csv_stream = io.StringIO()
        combined_df.to_csv(csv_stream, index=False)
        csv_content = csv_stream.getvalue()
        
        return StreamingResponse(
            iter([csv_content.encode('utf-8')]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=all_incidents_report.csv"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@app.get("/entrenamientos")
async def get_entrenamientos():
    return {
        "sessions": [
            {"id": 1, "video": "video1.mp4", "fecha": "2024-04-01", "detections": 45, "confidence": 0.87, "action": "Ver Detalle"},
            {"id": 2, "video": "video2.mp4", "fecha": "2024-04-02", "detections": 32, "confidence": 0.92, "action": "Ver Detalle"},
            {"id": 3, "video": "video3.mp4", "fecha": "2024-04-03", "detections": 28, "confidence": 0.89, "action": "Ver Detalle"}
        ]
    }

@app.get("/metricas")
async def get_metricas():
    return {
        "detection_types": {"Fuego": 15, "Humo": 8, "Choque": 12},
        "model_performance": {"Precision": 0.94, "Recall": 0.91, "F1": 0.92},
        "server_status": {"cpu": 45, "gpu": 72, "fps": 30}
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

