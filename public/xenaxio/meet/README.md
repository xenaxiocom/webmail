# Background in video meetings (steps 92 and 93)

- `selfie_segmenter.tflite` — MediaPipe Selfie Segmenter (float16), Apache-2.0,
  from `storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/`
  (SHA-256 `191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b`).
  Model card: <https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Selfie%20Segmentation.pdf>.
- `selfie_segmenter_landscape.tflite` — the same model for landscape frames (144 × 256, faster and
  steadier on 16:9 cameras; step 94), Apache-2.0, from
  `storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/`
  (SHA-256 `490e9ea734313e0de10fa0cd9e3c6133e36ea4db2b7a49bde9ef019f72796b8e`).
- `vision/` — MediaPipe's WebAssembly (`@mediapipe/tasks-vision`, Apache-2.0),
  copied from `node_modules` by `scripts/xenaxio/meet-vision.mjs` at build time;
  not in git.
- `panoramas/` — 360° panoramas from Poly Haven, CC0 (step 93; details in its README).
