from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="DIIA Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
async def upload_results(summary: VideoSummary):
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        
        # Insert video
        cur.execute("INSERT INTO videos (name) VALUES (%s) RETURNING id", (summary.name,))
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
        return {"status": "success", "video_id": video_id, "detections_added": len(summary.detections)}

    
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    
    finally:
        if conn:
            conn.close()


@app.get("/")
async def root():
    return {"msg": "DIIA Backend ready - Analytics enabled"}

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
        cur = conn.cursor()
        cur.execute("""
            SELECT v.name, d.label, d.start_time, d.end_time, d.confidence, d.severity,
                   a.downtime_seconds, a.atasco_frequency, a.unique_objects, a.avg_confidence
            FROM videos v 
            LEFT JOIN detections d ON v.id = d.video_id 
            LEFT JOIN analytics a ON v.id = a.video_id 
            WHERE v.id = %s ORDER BY d.start_time
        """, (video_id,))
        results = cur.fetchall()
        
        # Generate CSV
        import csv
        import io
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Video', 'Label', 'Start', 'End', 'Conf', 'Severity', 'Downtime', 'Atasco Freq', 'Unique Objs', 'Avg Conf'])
        for row in results:
            writer.writerow(row)
        
        csv_content = output.getvalue()
        return Response(content=csv_content, media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=video_{video_id}_logs.csv"})
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

from fastapi.responses import Response


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

