# Demo material

Drop real screenshots/recordings here using the filenames below, then
reference them from the root `README.md`'s "Demo" section. Nothing in
this directory is generated or faked — it's intentionally empty until
real material is added.

| File | What it should show |
|---|---|
| `dashboard.png` | The Dashboard page: stats (total/in-progress/ready/published projects) and recent projects list |
| `project-workspace.png` | A project's workspace mid-pipeline or at review: the pipeline progress view, scenes, and generated media |
| `publish-flow.png` | The Publish tab: connected YouTube channel, title/description/tags/visibility, the confirmation step |
| `sample-video.mp4` | One real rendered output from the pipeline (mock providers are fine — it's still a real FFmpeg render) |
| `architecture-diagram.png` | A rendered version of the system diagram in `README.md`/`ARCHITECTURE.md` (e.g. exported from whatever diagramming tool you use) |
| `demo.gif` | A short (10-30s) screen recording of the idea-to-video flow: create project → watch pipeline progress → review result |

## Capturing these

- **Screenshots**: run the app locally (`README.md`'s Local Setup section), use mock providers so there's no cost, and capture at a reasonable browser width (1440px+ recommended) so UI text is legible.
- **Sample video**: any project run to completion produces a real file at `backend/storage/projects/<id>/final_video/*.mp4` (local storage) — copy one here directly.
- **Demo GIF**: a screen recorder (e.g. `ffmpeg -f x11grab` / macOS screen recording / a browser extension) capturing a full create → generate → review pass, then converted to GIF or kept as an embeddable MP4.

## Adding to the README

Once files exist here, add a section like this to the root `README.md` (after "Key features" reads well, before "Architecture"):

```markdown
## Demo

![Dashboard](./docs/demo/dashboard.png)
![Project workspace](./docs/demo/project-workspace.png)

[Watch a full generation pass](./docs/demo/demo.gif)
```

GitHub renders images and will link to (not inline-play) the GIF/MP4 if large — keep the GIF under a few MB or link to it instead of embedding if GitHub's file-size limits become an issue.
