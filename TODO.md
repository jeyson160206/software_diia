# DIIA Video Inference Engine Implementation
## Status: 🚀 In Progress (0/12 steps complete)

### Phase 1: Dependencies & Setup (1 step)
- ✅ 1. Update backend/requirements.txt: Add ultralytics, opencv-python, numpy

### Phase 2: Backend Implementation (4 steps)
- ✅ 2. Edit backend/main.py: Add imports (YOLO, cv2, time, defaultdict, json)
- ✅ 3. Add /analyze-video endpoint: Full video analysis with YOLOv8n.pt every 1s
- ✅ 4. Compute detections dict {label: [seconds]}, max_conf*100, inference_time
- ✅ 5. Save video to uploads/, return JSON {status:OK, detections, inference_time, video_path}

### Phase 3: Frontend UI Updates (4 steps)
- ✅ 6. Edit Frontend/index.html: Add #loadingSpinner div + #inference-time metric

- [ ] 7. Edit Frontend/styles.css: Neon spinner anim, scrollable .detections-list ul, inference styles
- ✅ 8. Edit Frontend/script.js: Upload -> POST /analyze-video, show spinner, parse results

- [ ] 9. Populate persistent badges "FUEGO (1s,2s...) Conf:XX%", add inference_time, enable video

### Phase 4: DB Integration & Polish (2 steps)
- [ ] 10. Update backend/main.py: Store timestamps JSON in detections table (ALTER if needed via alter_schema.sql)
- [ ] 11. Integrate with existing /upload-results or call after analysis

### Phase 5: Testing & Demo (1 step)
- [ ] 12. Test full flow, pip install, run uvicorn, upload sample video

**Next Step: #1 - Update requirements.txt**
