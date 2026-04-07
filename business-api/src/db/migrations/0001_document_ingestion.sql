ALTER TABLE documents ADD COLUMN ocr_text TEXT;
ALTER TABLE documents ADD COLUMN ocr_error TEXT;
ALTER TABLE documents ADD COLUMN ocr_engine TEXT;
ALTER TABLE documents ADD COLUMN ocr_completed_at TEXT;
ALTER TABLE documents ADD COLUMN extracted_data_json TEXT;
ALTER TABLE documents ADD COLUMN linked_entity_type TEXT;
ALTER TABLE documents ADD COLUMN linked_entity_id TEXT;
