-- alter_schema.sql - Analytics upgrade
-- Run: psql -U postgres -d software -f backend/alter_schema.sql

ALTER TABLE detections ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'Low';
ALTER TABLE detections ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS analytics (
    id SERIAL PRIMARY KEY,
    video_id INTEGER REFERENCES videos(id),
    downtime_seconds FLOAT DEFAULT 0,
    atasco_frequency INTEGER DEFAULT 0,
    unique_objects INTEGER DEFAULT 0,
    avg_confidence FLOAT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trigger for severity
CREATE OR REPLACE FUNCTION update_severity()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.end_time - NEW.start_time) > 5 THEN
        NEW.severity = 'High';
    ELSIF (NEW.end_time - NEW.start_time) > 2 THEN
        NEW.severity = 'Medium';
    ELSE
        NEW.severity = 'Low';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_severity
    BEFORE INSERT OR UPDATE ON detections
    FOR EACH ROW EXECUTE FUNCTION update_severity();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_analytics_video ON analytics(video_id);
CREATE INDEX IF NOT EXISTS idx_detections_severity ON detections(severity);

