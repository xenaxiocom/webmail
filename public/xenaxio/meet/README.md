# Background in video meetings (step 92)

- `selfie_segmenter.tflite` — MediaPipe Selfie Segmenter (float16), Apache-2.0,
  from `storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/`
  (SHA-256 `191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b`).
  Model card: <https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Selfie%20Segmentation.pdf>.
- `vision/` — MediaPipe's WebAssembly (`@mediapipe/tasks-vision`, Apache-2.0),
  copied from `node_modules` by `scripts/xenaxio/meet-vision.mjs` at build time;
  not in git.
