# ScanMyResume

AI-powered resume reviewer: upload a PDF resume, get an ATS score plus structured feedback (tone & style, content, structure, skills) tailored to the job you're applying for.

## How it works

1. **Upload** a PDF resume with a target company, job title, and job description.
2. **PDF → image**: the first page is rendered to an image (pdf.js).
3. **Text extraction**: selectable text is extracted from **all** pages (`getTextContent`).
4. **AI review**: the image + full extracted text + job details are sent to Gemini, which returns scores and tips as JSON.
5. **Local ATS check**: a deterministic, offline check runs alongside the AI — job-keyword coverage, contact/section parsing, bullet and length checks — blended 50/50 with the AI's ATS score.
6. **Review page** shows the headline score, category breakdown, and ATS card with combined tips.

All data (auth, resumes, images) is stored **locally in the browser** (localStorage + IndexedDB). There is no backend.

## Tech stack

- React 18 + React Router 7 (`createBrowserRouter`) + Vite 5
- Tailwind CSS, Framer Motion, `react-dropzone`, Zustand
- `pdfjs-dist` for PDF rendering / text extraction
- Google Gemini API (`v1beta`, `generateContent`) — single pinned model

## Getting started

**Requirements:** Node.js ≥ 20.

```bash
npm install
cp .env.example .env
# edit .env and set VITE_GEMINI_API_KEY (see below)
npm run dev
```

| Script          | What it does                              |
|-----------------|-------------------------------------------|
| `npm run dev`   | Start the dev server (http://localhost:5173) |
| `npm run build` | Type-safe production build into `dist/`   |
| `npx tsc --noEmit` | Typecheck only                         |
| `npm run preview` | Serve the production build locally     |

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `VITE_GEMINI_API_KEY` | Yes | Google AI Studio API key. Get one at [aistudio.google.com](https://aistudio.google.com). |
| `VITE_GEMINI_MODEL` | No | Model id (default: `gemini-flash-lite-latest` — verified working; check availability via `GET .../v1beta/models?key=KEY`). |
| `VITE_GEMINI_FALLBACK_MODEL` | No | Opt-in comma-separated fallback chain (empty by default = single model, keeps reviews comparable). |

> The key ships inside the client-side JS bundle. Restrict it in Google Cloud / AI Studio to the **Generative Language API** (and ideally to your site's HTTP referrers), or anyone can spend your quota.

## Deployment (GitHub Pages)

Pushing to `main` triggers `.github/workflows/deploy.yml`: install → build with the repo base path → SPA fallback (`404.html`) → deploy.

Two one-time repo settings are required:

1. **Settings → Secrets and variables → Actions** → new secret `VITE_GEMINI_API_KEY`.
2. **Settings → Pages** → Source: **GitHub Actions**.

The site then lives at `https://<user>.github.io/ScanMyResume/`.

## Project structure

```
app/
  components/   UI pieces (ATS card, Summary, Details, uploader, score visuals)
  lib/
    gemini.ts   Gemini API client (timeout, retries, model chain, JSON output)
    pdf2img.ts  PDF → image (page 1) + full-text extraction (all pages)
    atsLocal.ts Deterministic ATS simulation (keywords + parsing checks)
    puter.ts    Local store: auth (localStorage), KV + files (IndexedDB)
  routes/       home, auth, upload, resume review, wipe
constants/      AI prompt + expected JSON format
```

## Notes / limitations

- Only **reviewed** records appear on the home page; in-progress uploads are hidden until scoring finishes.
- Scores vary slightly between runs and models (LLM); the local ATS half is fully deterministic.
- Free-tier Gemini keys are throttled at peak demand (HTTP 503) — the client retries with backoff; enabling billing removes most of it.
