from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import os
import io
import shutil

from ultralytics import YOLO
import cv2
import time
from collections import defaultdict
import json

from fastapi.staticfiles import StaticFiles

app = FastAPI(title="DIIA Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*", "http://localhost:5500", "http://127.0.0.1:5500"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory="backend/uploads"), name="uploads")

# DB config
DB_CONFIG = {
    "host": "localhost",
    "database": "software",
    "user": "postgres",  # assume default
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

@app.post("/upload-results")
async def upload_results(summary: VideoSummary, video: UploadFile = File(...)):
    # Create uploads dir
    os.makedirs("uploads", exist_ok=True)
    
    # Save video file
    video_path = f"uploads/{video.filename}"
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


@app.post("/analyze-video")
async def analyze_video(video: UploadFile = File(...)):
    filename = video.filename
    start_time = time.time()
    
    # Save video first for OpenCV
    os.makedirs("backend/uploads", exist_ok=True)
    video_path = f"backend/uploads/{filename}"
    content = await video.read()
    with open(video_path, "wb") as f:
        f.write(content)
    
    # Load YOLO model (nano for speed, change to custom.pt later)
    model = YOLO("yolov8n.pt")
    
    # Open video with path for OpenCV
    cap = cv2.VideoCapture(video_path)
    
    # Video info
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = frame_count / fps if fps > 0 else 0
    
    # Detections storage
    detections = defaultdict(list)
    max_confs = {}
    
    # Analyze every 1 second
    for sec in range(0, int(duration) + 1):
        cap.set(cv2.CAP_PROP_POS_MSEC, sec * 1000)
        ret, frame = cap.read()
        if not ret:
            break
        
        # YOLO inference
        results = model(frame, verbose=False)
        
        for result in results:
            if result.boxes is not None:
                for box in result.boxes:
                    cls_id = int(box.cls[0])
                    label = model.names[cls_id]
                    conf = float(box.conf[0])
                    
                    detections[label].append(sec)
                    if label not in max_confs or conf > max_confs[label]:
                        max_confs[label] = conf
    
    cap.release()
    
    end_time = time.time()
    inference_time = round(end_time - start_time, 2)
    
    # Scale confidence to 0-100
    confs_100 = {label: round(max_conf * 100, 1) for label, max_conf in max_confs.items()}
    
    # Prepare response
    result_detections = {}
    for label, seconds in detections.items():
        unique_seconds = sorted(list(set(seconds)))
        result_detections[label] = {
            "seconds": unique_seconds,
            "confidence": confs_100.get(label, 0),
            "count": len(unique_seconds)
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


@app.get("/")
async def root():
    return {"msg": "DIIA Backend ready - Full UI + Analytics"}


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

@app.get("/export/{video_id}")
async def export_logs(video_id: int):
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT v.name, d.label, d.start_time, d.end_time, d.confidence, d.severity,
                   a.downtime_seconds, a.atasco_frequency, a.unique_objects, a.avg_confidence
            FROM videos v 
            LEFT JOIN detections d ON v.id = d.video_id 
            LEFT JOIN analytics a ON v.id = a.video_id 
            WHERE v.id = %s ORDER BY d.start_time
        """, (video_id,))
        results = cur.fetchall()
        
        # Generate CSV with pandas
        df = pd.DataFrame([dict(r) for r in results])
        csv_stream = io.StringIO()
        df.to_csv(csv_stream, index=False)
        csv_content = csv_stream.getvalue()
        
        return StreamingResponse(
            iter([csv_content.encode('utf-8')]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=video_{video_id}_report.csv"}
        )
    
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

if __name__ == "__main__":
    import uvicorn
    import shutil
    uvicorn.run(app, host="0.0.0.0", port=8000)

