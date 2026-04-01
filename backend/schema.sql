-- schema.sql for DIIA PostgreSQL 'software' db
-- Run: psql -U postgres -d software -f schema.sql

CREATE TABLE IF NOT EXISTS videos (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS detections (
    id SERIAL PRIMARY KEY,
    video_id INTEGER REFERENCES videos(id),
    label VARCHAR(50) NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    confidence FLOAT NOT NULL,
    status VARCHAR(20) DEFAULT 'detected'
);

-- Indexes for perf
CREATE INDEX idx_detections_video ON detections(video_id);
CREATE INDEX idx_detections_label ON detections(label);
CREATE INDEX idx_detections_time ON detections(start_time, end_time);

