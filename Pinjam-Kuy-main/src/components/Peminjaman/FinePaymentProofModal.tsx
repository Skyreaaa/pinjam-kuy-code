import React, { useCallback, useRef, useState } from 'react';
import { profileApi } from '../../services/api';
import { adaptiveCompress, formatBytes, processImage, cropImage } from '../../utils/imageProcessing';
import ReactCrop, { Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

interface FinePaymentProofModalProps {
  loanIds: number[];
  onClose: () => void;
  onSuccess: () => void;
}

// Backend currently enforces 5MB; we target a tighter post-processing size (<= 1MB ideally)
const RAW_MAX_SIZE = 5 * 1024 * 1024; // raw file limit before processing (frontend early reject)
const TARGET_MAX_BYTES = 1024 * 1024; // strive for <=1MB after compression

const humanSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  return (kb / 1024).toFixed(2) + ' MB';
};

const FinePaymentProofModal: React.FC<FinePaymentProofModalProps> = ({ loanIds, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [rotDeg, setRotDeg] = useState(0);
  const [cropMode, setCropMode] = useState(false);
  const [crop, setCrop] = useState<Crop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<Crop | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const validateFile = (f: File) => {
    if (!f.type.startsWith('image/')) return 'File harus berupa gambar (jpeg/png/webp).';
    if (f.size > RAW_MAX_SIZE) return 'Ukuran file melebihi 5MB.';
    return null;
  };

  const handleSelect = async (f: File) => {
    const msg = validateFile(f);
    if (msg) { setError(msg); setFile(null); setPreview(null); return; }
    setError(null);
    // Process (max dimension 1600, compress adaptively to <=1MB if possible)
    let processed = f;
    try {
      processed = await adaptiveCompress(f, {
        maxWidth: 1600,
        maxHeight: 1600,
        outputType: f.type === 'image/png' ? 'image/png' : 'image/jpeg',
        preserveTransparency: f.type === 'image/png',
        maxBytes: TARGET_MAX_BYTES,
        qualitySteps: [0.8, 0.7, 0.6, 0.5, 0.4]
      });
      if (processed.size > TARGET_MAX_BYTES) {
        // Not fatal; just warn user
        setError(`Peringatan: Bukti masih ${formatBytes(processed.size)} (>1MB). Lanjutkan jika tetap ingin.`);
      }
    } catch (err) {
      console.warn('Compression failed, using original proof file:', err);
    }
    setFile(processed);
    const url = URL.createObjectURL(processed);
    setPreview(url);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleSelect(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelect(e.dataTransfer.files[0]);
    }
  }, []);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); };

  const resetFile = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null); setPreview(null); setError(null); setRotDeg(0);
  };

  const rotateImage = async () => {
    if (!file) return;
    try {
      const nextRot = (rotDeg + 90) % 360;
      // Rotate based on original chain each time by applying additional 90°
      const rotated = await processImage(file, {
        maxWidth: 4000,
        maxHeight: 4000,
        outputType: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
        preserveTransparency: file.type === 'image/png',
        quality: 0.9,
        rotateDeg: 90
      });
      setRotDeg(nextRot);
      setFile(rotated);
      if (preview) URL.revokeObjectURL(preview);
      const url = URL.createObjectURL(rotated);
      setPreview(url);
    } catch (err) {
      console.warn('Gagal memutar gambar:', err);
      setError('Gagal memutar gambar.');
    }
  };

  const toggleCropMode = () => {
    if (!preview) return;
    if (!cropMode) {
      // initialize crop to full image (will adjust once image loads)
      setCrop(undefined);
      setCompletedCrop(null);
    }
    setCropMode(m => !m);
  };

  const applyCrop = async () => {
    if (!file || !completedCrop || !imgRef.current || !completedCrop.width || !completedCrop.height) { setCropMode(false); return; }
    try {
      const naturalW = imgRef.current.naturalWidth;
      const naturalH = imgRef.current.naturalHeight;
      const displayW = imgRef.current.width;
      const displayH = imgRef.current.height;
      const scaleX = naturalW / displayW;
      const scaleY = naturalH / displayH;
      const cropRect = {
        x: completedCrop.x * scaleX,
        y: completedCrop.y * scaleY,
        width: completedCrop.width * scaleX,
        height: completedCrop.height * scaleY
      };
      const cropped = await cropImage(file, cropRect, {
        outputType: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
        preserveTransparency: file.type === 'image/png',
        quality: 0.9,
        rotateDeg: 0,
        targetMaxWidth: 1600,
        targetMaxHeight: 1600
      });
      const finalFile = await adaptiveCompress(cropped, {
        maxWidth: 1600,
        maxHeight: 1600,
        outputType: (['image/jpeg','image/png','image/webp'].includes(cropped.type) ? cropped.type : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp',
        preserveTransparency: cropped.type === 'image/png',
        maxBytes: TARGET_MAX_BYTES,
        qualitySteps: [0.85,0.75,0.65,0.55,0.45]
      });
      setFile(finalFile);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(finalFile));
    } catch (err) {
      console.warn('Crop gagal:', err);
      setError('Gagal memotong gambar');
    } finally {
      setCropMode(false);
    }
  };

  const handleSubmit = async () => {
    if (!file) { setError('Pilih / drop file bukti terlebih dahulu.'); return; }
    setSubmitting(true); setError(null);
    try {
      await profileApi.uploadFineProof(loanIds, file);
      resetFile();
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Gagal mengunggah bukti.');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="modal-backdrop fine-proof-modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal fine-proof-modal">
        <h3>Bukti Pembayaran Denda</h3>
        <p className="fine-proof-subtitle">{loanIds.length} denda akan dikirim bukti pembayarannya.</p>
        <div
          className={`fine-drop-zone ${dragActive ? 'drag-active' : ''} ${preview ? 'has-file' : ''}`}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          aria-label="Area unggah bukti (klik atau drag & drop)"
          tabIndex={0}
        >
          {!preview && (
            <>
              <span className="fine-drop-instruction">Klik atau seret & lepas gambar bukti di sini</span>
              <span className="fine-drop-hint">Format: JPG / PNG / WEBP • Maks 5MB</span>
            </>
          )}
          {preview && (
            <div className="fine-preview-wrapper">
              <div className={`fine-preview-stage ${cropMode ? 'crop-mode': ''}`}>
                {cropMode ? (
                  <ReactCrop
                    crop={crop}
                    onChange={(_, percentCrop) => setCrop(percentCrop as any)}
                    onComplete={(c)=> setCompletedCrop(c)}
                    aspect={undefined}
                    keepSelection
                  >
                    <img 
                      ref={imgRef}
                      src={preview} 
                      alt="Preview Bukti" 
                      className="fine-preview-image" 
                      onLoad={(e)=>{
                        if(!crop){
                          const target = e.currentTarget;
                          setCrop({ unit:'px', x:10, y:10, width: Math.min( target.naturalWidth-20, target.naturalWidth*0.8), height: Math.min(target.naturalHeight-20, target.naturalHeight*0.8) });
                        }
                      }}
                    />
                  </ReactCrop>
                ) : (
                  <img ref={imgRef} src={preview} alt="Preview Bukti" className="fine-preview-image" />
                )}
              </div>
              <div className="fine-file-meta">
                <strong>{file?.name}</strong>
                <span>{file ? formatBytes(file.size) : ''}</span>
              </div>
              <div className="fine-proof-actions-inline">
                <button type="button" className="fine-btn-secondary small" onClick={(e)=>{ e.stopPropagation(); rotateImage(); }}>Putar 90°</button>
                <button type="button" className="fine-btn-secondary small" onClick={(e)=>{ e.stopPropagation(); toggleCropMode(); }}>{cropMode ? 'Batal Crop' : 'Crop'}</button>
                {cropMode && <button type="button" className="fine-btn-secondary small" onClick={(e)=>{ e.stopPropagation(); applyCrop(); }} disabled={!completedCrop}>Terapkan</button>}
                <button type="button" className="fine-btn-secondary small" onClick={(e)=>{ e.stopPropagation(); resetFile(); }}>Ganti File</button>
              </div>
            </div>
          )}
          {/* Ganti hidden dengan teknik label+input untuk kompatibilitas mobile */}
          <input id="fine-proof-input" ref={inputRef} type="file" accept="image/*;capture=camera" onChange={onFileChange} className="visually-hidden-file" />
        </div>
        <div className="fine-proof-actions-extra">
          <label htmlFor="fine-proof-input" className="fine-btn-secondary">Pilih dari Kamera/Galeri</label>
        </div>
        {error && <p className="status-message error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button onClick={() => { if(!submitting) { resetFile(); onClose(); }}} disabled={submitting}>Batal</button>
          <button onClick={handleSubmit} disabled={submitting || !file}>{submitting ? 'Mengunggah...' : 'Kirim Bukti'}</button>
        </div>
      </div>
    </div>
  );
};

export default FinePaymentProofModal;
