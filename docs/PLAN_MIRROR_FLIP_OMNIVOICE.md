# Kế hoạch Mirror, Flip và OmniVoice TTS

## 1. Kiến trúc hiện tại

- Ứng dụng là Electron/Nextron với React + TypeScript ở renderer và Electron main process.
- `useTimelineEditor` là state duy nhất của timeline, bao gồm project, track, clip, seek, split, duplicate, move, undo và redo.
- `TimelineEditor` dựng preview bằng các phần tử video/audio theo clip và đồng bộ chúng với một master clock.
- `timelineFilterGraph` và `timelineExporter` tạo filter graph FFmpeg cho multi-track video/audio/subtitle.
- IPC được expose qua `main/preload.ts`; renderer không gọi Python hoặc shell trực tiếp.
- Demucs đã có queue riêng ở main process, nhưng chưa có OmniVoice worker.

## 2. Hiện trạng đã xác minh

- Runtime đóng gói: `extraResources/demucs-runtime/python.exe`, Python 3.11.9.
- Runtime có Torch `2.1.2+cu121`, `torch.cuda.is_available() === true`.
- Runtime hiện chưa import được `omnivoice`.
- Python hệ thống không có trên PATH trong phiên kiểm tra.
- FFmpeg/FFprobe có tại `C:\ffmpeg\bin`.
- Chưa tải lại model OmniVoice và chưa cài package AI global.

## 3. Data model

Mở rộng `TimelineClip` bằng transform clip-level, migration mặc định false:

```ts
type ClipVisualTransform = {
  mirrorX: boolean;
  flipY: boolean;
};
```

Các thuộc tính này độc lập với source asset, track và project. Chúng phải được giữ qua save/load, autosave, split, duplicate, copy/paste, move track và export.

TTS dùng `TimelineClip` loại audio như audio clip thường. Metadata TTS chỉ dùng asset ID hoặc relative path, không lưu absolute path của máy trong project.

## 4. Preview và export

- Preview dùng helper transform chung, compose transform hiện có với `scaleX(-1)` cho `mirrorX` và `scaleY(-1)` cho `flipY`.
- Transform chỉ gắn vào phần tử video của clip, không reset clock, currentTime, duration hoặc audio.
- Export áp dụng `hflip` và `vflip` trên từng input video trước overlay, không áp dụng lên audio.
- Audio TTS đi qua audio graph hiện có, tôn trọng start, trim, volume, mute và project duration.

## 5. OmniVoice

Triển khai worker persistent trong main process, concurrency mặc định 1, lazy-load model, queue/cancel/shutdown sạch. Trước khi chạy thật phải probe package, model cache và API phiên bản đang cài. Nếu package/model thiếu, UI hiển thị trạng thái và không tạo output giả.

Khi runtime sẵn sàng, TTS sẽ:

1. Nhận text và capability thực tế.
2. Generate WAV thật ở sample rate API trả về.
3. Validate file bằng FFprobe và kiểm tra sample khác 0.
4. Đăng ký asset.
5. Tạo audio clip tại playhead hoặc cuối track.
6. Cho preview, drag, trim, split, duplicate, volume, mute và export dùng cùng timeline data model.

## 6. File dự kiến sửa

- `types/subtitleMerge.ts`: transform và TTS metadata.
- `renderer/components/subtitleMerge/hooks/useTimelineEditor.ts`: migration, command cập nhật transform, clip TTS.
- `renderer/components/subtitleMerge/TimelineEditor.tsx`: inspector/toolbar, preview transform, TTS action.
- `main/helpers/timelineFilterGraph.ts`: hflip/vflip từng clip.
- `main/helpers/timelineExporter.ts`: validation và output compatibility.
- `main/preload.ts`, `types/window.d.ts`: IPC type surface nếu cần.
- `main/helpers/omnivoiceService.ts`, `main/helpers/ipcOmniVoiceHandlers.ts`: worker queue và IPC.
- `renderer/components/subtitleMerge/OmniVoicePanel.tsx`: UI theo capabilities.
- Tests unit, integration FFmpeg và smoke test OmniVoice khi runtime thực tế có package/model.

## 7. Test plan

- Unit: transform độc lập, toggle, migration, split, duplicate, undo/redo.
- FFmpeg integration: PNG/MP4 bất đối xứng, bình thường, `hflip`, `vflip`, cả hai, crop/rotation/scale, multi-track overlay và audio preservation.
- Timeline: playhead không reset, preview transform không tạo video element mới, audio/subtitle không bị tác động.
- TTS: probe, worker reuse, queue FIFO, cancel, WAV non-empty, FFprobe, preview startTime, trim/mute/volume, export mix.
- Full export: so sánh frame preview/export và duration/audio stream.

## 8. Rủi ro và rollback

- OmniVoice có thể yêu cầu dependency/model lớn; không tải tự động nếu chưa xác nhận cache và dung lượng.
- Torch của Demucs không mặc định tương thích OmniVoice; giữ runtime riêng hoặc tạo `.venv-omnivoice`, không thay đổi runtime Demucs đang hoạt động.
- Nếu export filter lỗi, tắt transform mới bằng migration/default false vẫn mở được project cũ.
- Rollback theo từng commit logic; không dùng `git reset --hard` hoặc ghi đè thay đổi người dùng.
